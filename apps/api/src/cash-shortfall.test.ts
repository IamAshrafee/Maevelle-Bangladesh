import { beforeAll, afterAll, expect, it } from 'vitest';
import Fastify from 'fastify';
import { isolatedCartDatabase } from '@maevelle/database/testing/cart';
import { runMigrations } from '@maevelle/database/migrate';
import { cashSettlementFixture } from '@maevelle/database/testing/cash-settlement';
import { registerCashShortfallRoutes } from './routes/cash-shortfall.js';
import type { createAuth } from './auth/auth.js';

let isolated: Awaited<ReturnType<typeof isolatedCartDatabase>>,
  f: Awaited<ReturnType<typeof cashSettlementFixture>>,
  c: Awaited<ReturnType<Awaited<ReturnType<typeof cashSettlementFixture>>['collect']>>;
let actor: string;
const app = Fastify({ logger: false });
beforeAll(async () => {
  isolated = await isolatedCartDatabase();
  await runMigrations(isolated.database.db);
  f = await cashSettlementFixture(isolated.database.db);
  c = await f.collect();
  actor = f.owner;
  // Only identity is stubbed in this route-level test; real database tenant/capability checks and financial records remain authoritative.
  const auth = {
    api: { getSession: async () => ({ user: { id: actor } }) },
  } as unknown as ReturnType<typeof createAuth>;
  registerCashShortfallRoutes(app, isolated.database, auth);
});
afterAll(async () => {
  await app.close();
  await isolated?.close();
});
it('discovers bounded independently reviewed policies without enabling financial eligibility', async () => {
  actor = f.owner;
  const headers = { 'x-organization-id': f.organizationId };
  const policies = await app.inject({
    url: '/admin/payments/cash-policies?page=1&pageSize=1',
    headers,
  });
  expect(policies.statusCode).toBe(200);
  expect(policies.headers['cache-control']).toBe('private, no-store');
  expect(policies.json().data.items).toHaveLength(1);
  expect(policies.json().data.items[0]).toMatchObject({
    status: 'APPROVED',
    activation: 'POLICY_BLOCKED',
    approvedBy: f.reviewer,
  });
  expect(
    (await app.inject({ url: '/admin/payments/cash-policies?pageSize=101', headers })).statusCode,
  ).toBe(400);
  const eligibility = await app.inject({
    url: `/admin/payments/orders/${c.orderId}/cash-eligibility`,
    headers,
  });
  expect(eligibility.json().data).toMatchObject({
    canApply: false,
    canApprove: false,
    activation: 'POLICY_BLOCKED',
    outstanding: '1.0000',
  });
  actor = f.viewer;
  expect((await app.inject({ url: '/admin/payments/cash-policies', headers })).statusCode).toBe(
    403,
  );
  actor = f.owner;
  expect(
    (
      await app.inject({
        url: '/admin/payments/cash-policies',
        headers: { 'x-organization-id': crypto.randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
});
it('returns exact original/cash/residual with an explicit unavailable activation state', async () => {
  actor = f.owner;
  const r = await app.inject({
    url: `/admin/payments/orders/${c.orderId}/cash-settlement`,
    headers: { 'x-organization-id': f.organizationId },
  });
  expect(r.statusCode).toBe(200);
  expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.json().data).toMatchObject({
    originalPayable: '81.0000',
    actualCollected: '80.0000',
    outstanding: '1.0000',
    adjustmentActivation: 'POLICY_BLOCKED',
  });
});
it('never activates synthetic adjustment approval through HTTP', async () => {
  actor = f.owner;
  const r = await app.inject({
    method: 'POST',
    url: '/admin/payments/cash-shortfalls',
    payload: c.input,
    headers: { 'x-organization-id': f.organizationId, 'idempotency-key': crypto.randomUUID() },
  });
  expect(r.statusCode).toBe(422);
  expect(r.json().error.code).toBe('POLICY_BLOCKED');
  const exact = await app.inject({
    method: 'POST',
    url: '/admin/payments/cash-shortfalls',
    payload: { ...c.input, amount: '1.0000' },
    headers: { 'x-organization-id': f.organizationId, 'idempotency-key': crypto.randomUUID() },
  });
  expect(exact.statusCode).toBe(422);
  expect(exact.json().error.code).toBe('POLICY_BLOCKED');
});
it('denies insufficient capability and a foreign tenant', async () => {
  actor = f.viewer;
  const denied = await app.inject({
    method: 'POST',
    url: '/admin/payments/cash-shortfalls',
    payload: c.input,
    headers: { 'x-organization-id': f.organizationId, 'idempotency-key': crypto.randomUUID() },
  });
  expect(denied.statusCode).toBe(403);
  actor = f.owner;
  expect(
    (
      await app.inject({
        url: `/admin/payments/orders/${c.orderId}/cash-settlement`,
        headers: { 'x-organization-id': crypto.randomUUID() },
      })
    ).statusCode,
  ).toBe(403);
});
it('rejects caller-supplied approval authority and unsupported cash precision at the boundary', async () => {
  actor = f.owner;
  for (const body of [
    { ...c.input, approvedBy: f.reviewer },
    { ...c.input, amount: '0.5000' },
  ])
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/admin/payments/cash-shortfalls',
          payload: body,
          headers: {
            'x-organization-id': f.organizationId,
            'idempotency-key': crypto.randomUUID(),
          },
        })
      ).statusCode,
    ).toBe(400);
});
