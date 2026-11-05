import { beforeAll, afterAll, it, expect } from 'vitest';
import Fastify from 'fastify';
import { isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { runMigrations } from '@maevelle/database/migrate';
import { manualPaymentFixture } from '@maevelle/database/testing/manual-payments';
import { registerPaymentRoutes } from './routes/payments.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
let f: Awaited<ReturnType<typeof manualPaymentFixture>>;
const app = Fastify();
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  await runMigrations(isolation.database.db);
  f = await manualPaymentFixture(isolation.database.db);
  registerPaymentRoutes(app, isolation.database, {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('x-synthetic-user');
        return id ? { user: { id } } : null;
      },
    },
  } as never);
  await app.ready();
}, 30000);
afterAll(async () => {
  await app.close();
  await isolation?.close();
});
const headers = (id: string) => ({ 'x-synthetic-user': id, 'x-organization-id': f.organizationId });
it('denies destination viewing/editing to payment viewers and denies anonymous access', async () => {
  expect((await app.inject({ url: '/admin/payments/destinations' })).statusCode).toBe(403);
  expect(
    (await app.inject({ url: '/admin/payments/destinations', headers: headers(f.viewer) }))
      .statusCode,
  ).toBe(403);
  expect(
    (await app.inject({ url: '/admin/payments/readiness', headers: headers(f.viewer) })).statusCode,
  ).toBe(200);
});
it('keeps readiness private and refuses unsafe wallet activation and instruction substitution', async () => {
  const r = await app.inject({ url: '/admin/payments/readiness', headers: headers(f.owner) });
  expect(r.headers['cache-control']).toBe('no-store');
  expect(r.json().data.every((x: { eligible: boolean }) => x.eligible === false)).toBe(true);
  const edit = await app.inject({
    method: 'PUT',
    url: '/admin/payments/methods/BKASH_MANUAL',
    headers: headers(f.owner),
    payload: {
      name: 'Injected wallet',
      status: 'ACTIVE',
      displayOrder: 20,
      paymentWindowMinutes: 60,
      instructions: { accountNumber: '01800000000' },
    },
  });
  expect(edit.statusCode).toBe(422);
  expect(edit.json().error.code).toBe('POLICY_BLOCKED');
});
it('requires independent receipt evidence at the API boundary and enforces live review permissions', async () => {
  const c = await f.order();
  expect(
    (
      await app.inject({
        method: 'POST',
        url: `/admin/payments/attempts/${c.attemptId}/verify`,
        headers: { ...headers(f.owner), 'idempotency-key': crypto.randomUUID() },
        payload: { confirmedAmount: '100' },
      })
    ).statusCode,
  ).toBe(400);
  const denied = await app.inject({
    method: 'POST',
    url: `/admin/payments/attempts/${c.attemptId}/verify`,
    headers: { ...headers(f.viewer), 'idempotency-key': crypto.randomUUID() },
    payload: { confirmedAmount: '100', evidence: c.evidence },
  });
  expect(denied.statusCode).toBe(403);
  const verified = await app.inject({
    method: 'POST',
    url: `/admin/payments/attempts/${c.attemptId}/verify`,
    headers: { ...headers(f.reviewer), 'idempotency-key': crypto.randomUUID() },
    payload: { confirmedAmount: '100', evidence: c.evidence },
  });
  expect(verified.statusCode).toBe(200);
  expect(verified.json().data.amount).toBe('100.0000');
});
it('blocks cross-tenant requests even with a valid local reviewer identity', async () => {
  const other = await manualPaymentFixture(isolation.database.db);
  const response = await app.inject({
    url: '/admin/payments/claims',
    headers: { ...headers(f.reviewer), 'x-organization-id': other.organizationId },
  });
  expect(response.statusCode).toBe(403);
});
