import { afterAll, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase, sql } from '@maevelle/database';
import { createOrganization, createOwnerMembership } from '@maevelle/database/platform';
import { adjustInventory } from '@maevelle/database/inventory';

import { buildApi } from './app.js';
import { createAuth } from './auth/auth.js';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://maevelle_dev:maevelle_dev_password@localhost:5434/maevelle_test';

const database = createDatabase({ connectionString: databaseUrl, maxConnections: 6 });

const config: RuntimeConfig = {
  nodeEnv: 'test',
  databaseUrl,
  testDatabaseUrl: databaseUrl,
  databasePoolMax: 6,
  apiHost: '127.0.0.1',
  apiPort: 3000,
  logLevel: 'error',
  workerHeartbeatIntervalMs: 30_000,
  betterAuthSecret: 'test-only-better-auth-secret-that-is-long-enough',
  authEncryptionKey: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  authBaseUrl: 'http://localhost:3000',
  authTrustedOrigins: ['http://localhost:3000'],
  authTotpIssuer: 'Maevelle',
  authTotpChallengeSeconds: 600,
  authTotpMaxFailedAttempts: 10,
  authTotpLockSeconds: 900,
  mediaStorageProvider: 'local',
  mediaStoragePath: 'var/test-media',
  mediaStorageRegion: 'auto',
  mediaPrivateBucket: 'private',
  mediaPublicBucket: 'public',
  mediaStorageForcePathStyle: true,
  mediaMaxUploadBytes: 10 * 1024 * 1024,
  mediaUploadExpirySeconds: 900,
  storefrontOrganizationCode: 'maevelle',
  storefrontBaseUrl: 'http://localhost:3001',
  storefrontInternalApiUrl: 'http://127.0.0.1:3000',
  emailEnabled: false,
  emailProvider: 'local',
  emailEnvironment: 'test',
  emailFromName: 'Maevelle',
  emailFromAddress: 'notifications@maevelle.example',
  emailReplyTo: 'support@maevelle.example',
  emailAllowedTestRecipients: [],
  smsEnabled: false,
  smsProvider: 'none',
  smsEnvironment: 'test',
  smsTestMode: true,
  smsAllowedTestRecipients: [],
  smsSenderType: 'PROVIDER_DEFAULT',
  smsMaxPerTick: 20,
  metaOAuthScopes: [],
  metaRequestTimeoutMs: 10_000,
};

function cookieHeader(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return '';
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

afterAll(async () => database.close());

async function setupTestContext() {
  const org = await createOrganization(database.db, {
    code: `unit-api-${crypto.randomUUID().slice(0, 8)}`,
    displayName: 'Unit Traceability API Test Org',
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });

  const email = `admin-${crypto.randomUUID()}@maevelle.local`;
  const password = 'Maevelle-admin-password-2026';
  const auth = createAuth(config, database, true);
  const signup = await auth.api.signUpEmail({
    body: { email, password, name: 'Traceability Admin' },
  });
  if (!signup.user?.id) throw new Error('Signup failed in test context.');

  await createOwnerMembership(database.db, org.id, signup.user.id, 'Traceability Admin');

  // Create warehouse location with STOCK_HOLDING
  const loc = await sql<{ id: string }>`
    insert into warehouse.locations (organization_id, code, name, location_type, status)
    values (${org.id}, 'MAIN-WH', 'Central Dhaka Warehouse', 'WAREHOUSE', 'ACTIVE')
    returning id
  `.execute(database.db);
  const locationId = loc.rows[0]!.id;

  await sql`
    insert into warehouse.location_capabilities (organization_id, location_id, capability_code)
    values (${org.id}, ${locationId}, 'STOCK_HOLDING')
  `.execute(database.db);

  // Create second location for move tests
  const loc2 = await sql<{ id: string }>`
    insert into warehouse.locations (organization_id, code, name, location_type, status)
    values (${org.id}, 'REPAIR-SEC', 'Repair & Cleaning Bay', 'WAREHOUSE', 'ACTIVE')
    returning id
  `.execute(database.db);
  const repairLocationId = loc2.rows[0]!.id;

  await sql`
    insert into warehouse.location_capabilities (organization_id, location_id, capability_code)
    values (${org.id}, ${repairLocationId}, 'STOCK_HOLDING')
  `.execute(database.db);

  // Create product & variant
  const productType = await sql<{ id: string }>`
    insert into catalog.product_types (organization_id, code, name)
    values (${org.id}, ${`type-${crypto.randomUUID().slice(0, 6)}`}, 'Dress')
    returning id
  `.execute(database.db);

  const prod = await sql<{ id: string }>`
    insert into catalog.products (organization_id, product_type_id, handle, title, status)
    values (${org.id}, ${productType.rows[0]!.id}, ${`dress-${crypto.randomUUID().slice(0, 8)}`}, 'Chiffon Evening Dress', 'ACTIVE')
    returning id
  `.execute(database.db);

  const sku = `DRS-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  const v = await sql<{ id: string }>`
    insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature)
    values (${org.id}, ${prod.rows[0]!.id}, ${sku}, ${sku}, 'default')
    returning id
  `.execute(database.db);

  return {
    orgId: org.id,
    userId: signup.user.id,
    email,
    password,
    locationId,
    repairLocationId,
    productId: prod.rows[0]!.id,
    variantId: v.rows[0]!.id,
    sku,
  };
}

describe('Inventory Units & Traceability API Routes', () => {
  it('enforces authentication and authorization on admin unit endpoints', async () => {
    const app = buildApi({ database, config, logger: false });

    // Unauthenticated request must return 403
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/admin/inventory/units',
    });
    expect(unauthenticated.statusCode).toBe(403);

    await app.close();
  });

  it('executes full end-to-end lifecycle via Fastify endpoints', async () => {
    const app = buildApi({ database, config, logger: false });
    const ctx = await setupTestContext();

    // Sign in to get session cookie
    const signInRes = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      payload: { email: ctx.email, password: ctx.password },
    });
    expect(signInRes.statusCode).toBe(200);
    const sessionCookie = cookieHeader(signInRes.headers['set-cookie']);

    const headers = {
      cookie: sessionCookie,
      'x-organization-id': ctx.orgId,
      get 'idempotency-key'() {
        return crypto.randomUUID();
      },
    };

    // 1. Configure tracking mode to SERIAL
    const modeRes = await app.inject({
      method: 'POST',
      url: '/admin/inventory/units/tracking-mode',
      headers,
      payload: {
        variantId: ctx.variantId,
        trackingMode: 'SERIAL',
        expectedVersion: 0,
      },
    });
    expect(modeRes.statusCode).toBe(200);
    expect(modeRes.json().data.trackingMode).toBe('SERIAL');

    // 2. Adopt identities only after aggregate inventory truth exists.
    await adjustInventory(database.db, {
      organizationId: ctx.orgId,
      actorId: ctx.userId,
      locationId: ctx.locationId,
      variantId: ctx.variantId,
      condition: 'INSPECTION',
      quantityDelta: '3',
      reasonCode: 'OPENING_BALANCE',
      idempotencyKey: `api-unit-fixture-${crypto.randomUUID()}`,
    });

    const regRes = await app.inject({
      method: 'POST',
      url: '/admin/inventory/units/register',
      headers,
      payload: {
        variantId: ctx.variantId,
        locationId: ctx.locationId,
        quantity: 3,
        sourceType: 'MANUAL_INTAKE',
        inventoryCondition: 'INSPECTION',
        packageReference: 'BOX-EXP-01',
        storageNotes: 'Shelf A-3',
        notes: 'Inbound shipment from Guangzhou',
      },
    });
    expect(regRes.statusCode).toBe(201);
    const units = regRes.json().data;
    expect(units).toHaveLength(3);
    const unit1 = units[0]!;
    expect(unit1.unitCode).toMatch(/^MVU-\d+$/);
    expect(unit1.status).toBe('AWAITING_QC');
    expect(unit1.currentCondition).toBe('GRADE_A');
    expect(unit1.packageReference).toBe('BOX-EXP-01');

    const overviewRes = await app.inject({
      method: 'GET',
      url: '/admin/inventory/overview?attentionLimit=5',
      headers,
    });
    expect(overviewRes.statusCode).toBe(200);
    expect(overviewRes.json().data).toMatchObject({
      scope: { kind: 'ORGANIZATION', locationIds: [] },
      kpis: { onHand: '3.000000', unavailable: '3.000000' },
      workQueues: { unitsAwaitingQc: 3 },
      attention: {
        items: [expect.objectContaining({ code: 'OUT_OF_STOCK', locationId: ctx.locationId })],
      },
    });

    // 3. Fast Barcode Lookup via GET /admin/inventory/units/lookup
    const lookupRes = await app.inject({
      method: 'GET',
      url: `/admin/inventory/units/lookup?code=${unit1.unitCode.toLowerCase()}`,
      headers,
    });
    expect(lookupRes.statusCode).toBe(200);
    const lookupData = lookupRes.json().data;
    expect(lookupData.scannableCode).toBe(unit1.unitCode);
    expect(lookupData.barcodePayload).toBe(unit1.unitCode);
    expect(lookupData.code128Svg).toContain('<svg');
    expect(lookupData.permittedTransitions).toContain('AVAILABLE');

    // 4. Raw SVG Barcode Image via GET /admin/inventory/units/:unitId/barcode.svg
    const svgRes = await app.inject({
      method: 'GET',
      url: `/admin/inventory/units/${unit1.id}/barcode.svg`,
      headers,
    });
    expect(svgRes.statusCode).toBe(200);
    expect(svgRes.headers['content-type']).toContain('image/svg+xml');
    expect(svgRes.body).toContain('<svg');

    // 5. Inspect unit (Grade A Pass -> status AVAILABLE)
    const inspectRes = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit1.id}/inspections`,
      headers,
      payload: {
        inspectionStage: 'INBOUND_INTAKE',
        conditionResult: 'GRADE_A',
        notes: 'Seams and fabric in flawless condition',
        outcome: 'PASSED',
        disposition: 'RELEASE_SELLABLE',
        expectedVersion: unit1.version,
      },
    });
    expect(inspectRes.statusCode).toBe(201);
    const inspectData = inspectRes.json().data;
    expect(inspectData.unit.status).toBe('AVAILABLE');
    expect(inspectData.inspection.inspectionOutcome).toBe('PASSED');

    // 6. Inspect unit 2 as repair required
    const unit2 = units[1]!;
    const inspectRes2 = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit2.id}/inspections`,
      headers,
      payload: {
        inspectionStage: 'INBOUND_INTAKE',
        conditionResult: 'REPAIR_REQUIRED',
        defectDescription: 'Loose button on left sleeve cuff',
        outcome: 'HOLD_FOR_REPAIR',
        disposition: 'MOVE_TO_REPAIR',
        expectedVersion: unit2.version,
      },
    });
    expect(inspectRes2.statusCode).toBe(201);
    expect(inspectRes2.json().data.unit.status).toBe('ON_HOLD');

    // 7. Request repair via POST /admin/inventory/units/:unitId/repairs
    const repairReq = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit2.id}/repairs`,
      headers,
      payload: {
        defectDescription: 'Loose button on left sleeve cuff',
        actionRequired: 'Re-stitch button securely with matching silk thread',
        technicianName: 'Rafiq Master Tailor',
        expectedVersion: inspectRes2.json().data.unit.version,
      },
    });
    expect(repairReq.statusCode).toBe(201);
    const repairRecord = repairReq.json().data;
    expect(repairRecord.repairNumber).toMatch(/^REP-\d{4}-\d+$/);
    expect(repairRecord.repairStatus).toBe('REQUESTED');

    // 8. Complete repair via PATCH /admin/inventory/units/repairs/:repairId/complete
    const completeRepairRes = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/repairs/${repairRecord.id}/complete`,
      headers,
      payload: {
        actionPerformed: 'Restitched sleeve button and reinforced anchor stitching',
        technicianName: 'Rafiq Master Tailor',
        costAmount: '120.00',
        costCurrency: 'BDT',
        notes: 'Repair complete, awaiting reinspection',
        expectedVersion: repairRecord.version,
      },
    });
    expect(completeRepairRes.statusCode).toBe(200);
    expect(completeRepairRes.json().data.repairStatus).toBe('COMPLETED');
    expect(completeRepairRes.json().data.costAmount).toBe('120.0000');

    // 9. Reinspect repaired unit and release to AVAILABLE
    const reinspectRes = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit2.id}/inspections`,
      headers,
      payload: {
        inspectionStage: 'REINSPECTION',
        conditionResult: 'GRADE_A',
        notes: 'Button securely reattached, verified retail quality',
        outcome: 'PASSED',
        disposition: 'RELEASE_SELLABLE',
        expectedVersion: inspectRes2.json().data.unit.version + 2,
      },
    });
    expect(reinspectRes.statusCode).toBe(201);
    expect(reinspectRes.json().data.unit.status).toBe('AVAILABLE');

    // 10. Update packaging box reference
    const packagingHeaders = {
      ...headers,
      'idempotency-key': `packaging-${crypto.randomUUID()}`,
    };
    const packRes = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/${unit1.id}/packaging`,
      headers: packagingHeaders,
      payload: {
        packageReference: 'BOX-PREMIUM-LUX-05',
        storageNotes: 'Packed in dust bag with branded hanger',
        expectedVersion: inspectData.unit.version,
      },
    });
    expect(packRes.statusCode).toBe(200);
    expect(packRes.json().data.packageReference).toBe('BOX-PREMIUM-LUX-05');
    const packReplay = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/${unit1.id}/packaging`,
      headers: packagingHeaders,
      payload: {
        packageReference: 'BOX-PREMIUM-LUX-05',
        storageNotes: 'Packed in dust bag with branded hanger',
        expectedVersion: inspectData.unit.version,
      },
    });
    expect(packReplay.statusCode).toBe(200);
    expect(packReplay.json().data.version).toBe(packRes.json().data.version);

    const reusedKey = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/${unit1.id}/packaging`,
      headers: packagingHeaders,
      payload: {
        packageReference: 'BOX-DIFFERENT-COMMAND',
        expectedVersion: inspectData.unit.version,
      },
    });
    expect(reusedKey.statusCode).toBe(409);
    expect(reusedKey.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const stalePack = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/${unit1.id}/packaging`,
      headers,
      payload: {
        packageReference: 'BOX-STALE-ATTEMPT',
        expectedVersion: inspectData.unit.version,
      },
    });
    expect(stalePack.statusCode).toBe(409);
    expect(stalePack.json().error.code).toBe('STALE_VERSION');

    // 11. Direct cross-location moves are rejected; Transfers own that boundary.
    const moveRes = await app.inject({
      method: 'PATCH',
      url: `/admin/inventory/units/${unit1.id}/location`,
      headers,
      payload: {
        newLocationId: ctx.repairLocationId,
        newStorageNotes: 'Transfer Bay Shelf 1',
        reason: 'Temporary relocation for staging',
        expectedVersion: packRes.json().data.version,
      },
    });
    expect(moveRes.statusCode).toBe(422);
    expect(moveRes.json().error.code).toBe('INVALID_TRANSITION');

    // 12. Check event history timeline via GET /admin/inventory/units/:unitId/history
    const historyRes = await app.inject({
      method: 'GET',
      url: `/admin/inventory/units/${unit1.id}/history`,
      headers,
    });
    expect(historyRes.statusCode).toBe(200);
    const events = historyRes.json().data;
    expect(events.length).toBeGreaterThanOrEqual(3);
    const eventTypes = events.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain('REGISTERED');
    expect(eventTypes).toContain('INSPECTED');
    expect(eventTypes).toContain('REPACKAGED');
    expect(eventTypes).not.toContain('LOCATION_MOVED');

    // 13. Return intake requires dispatched state and posted receipt evidence.
    const returnRes = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit1.id}/receive-return`,
      headers,
      payload: {
        receivingLocationId: ctx.locationId,
        conditionResult: 'GRADE_B',
        notes: 'Customer returned dress with minor fabric fold crease',
        expectedVersion: packRes.json().data.version,
      },
    });
    expect(returnRes.statusCode).toBe(422);
    expect(returnRes.json().error.code).toBe('INVALID_TRANSITION');

    // 14. Write-off unit 3
    const unit3 = units[2]!;
    const writeOffRes = await app.inject({
      method: 'POST',
      url: `/admin/inventory/units/${unit3.id}/write-off`,
      headers,
      payload: {
        reason: 'Accidental chemical spill during handling - totally unsellable',
        expectedVersion: unit3.version,
      },
    });
    expect(writeOffRes.statusCode).toBe(200);
    expect(writeOffRes.json().data.status).toBe('WRITTEN_OFF');
    expect(writeOffRes.json().data.currentCondition).toBe('DAMAGED_UNSELLABLE');

    // 15. Reconciliation endpoint
    const reconRes = await app.inject({
      method: 'GET',
      url: `/admin/inventory/units/reconcile?variantId=${ctx.variantId}&locationId=${ctx.locationId}`,
      headers,
    });
    expect(reconRes.statusCode).toBe(200);
    const reconData = reconRes.json().data;
    expect(reconData.trackingMode).toBe('SERIAL');
    expect(reconData.discrepancies).toBeDefined();

    await app.close();
  });
});
