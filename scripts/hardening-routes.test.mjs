import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkAdminRoutes } from './hardening-routes.mjs';

test('checks every Admin handler, including imported capability guards', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maevelle-hardening-'));
  try {
    const helper = join(directory, 'guard.ts');
    const routes = join(directory, 'routes.ts');
    writeFileSync(
      helper,
      `export async function requireCapability(database, auth, headers, capability) {
      const session = await auth.api.getSession({ headers });
      if (!session?.user?.id) return;
      return findActiveAdminContext(database.db, session.user.id, { requiredCapability: capability });
    }`,
    );
    writeFileSync(
      routes,
      `import { requireCapability } from './guard.js';
      export function register(app, database, auth) {
        app.get('/admin/guarded', async (request, reply) => {
          const context = await requireCapability(database, auth, request.headers, 'catalog.view');
          if (!context) return reply.code(403).send();
          return { data: context.organizationId };
        });
        app.get('/admin/missing-capability', async (request, reply) => {
          const context = await requireCapability(database, auth, request.headers);
          if (!context) return reply.code(403).send();
          return { data: context.organizationId };
        });
        app.get('/admin/unguarded', async () => ({ data: 'leak' }));
      }`,
    );
    const result = checkAdminRoutes([routes]);
    assert.equal(result.count, 3);
    assert.equal(result.failures.length, 2);
    assert.ok(result.failures.some((finding) => finding.includes('/admin/missing-capability')));
    assert.ok(result.failures.some((finding) => finding.includes('/admin/unguarded')));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('does not accept a guard call whose result is ignored', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maevelle-hardening-'));
  try {
    const routes = join(directory, 'routes.ts');
    writeFileSync(
      routes,
      `async function admin(database, auth, headers, capability) {
      const session = await auth.api.getSession({ headers });
      return findActiveAdminContext(database.db, session.user.id, { requiredCapability: capability });
    }
    export function register(app, database, auth) {
      app.get('/admin/leak', async (request) => {
        await admin(database, auth, request.headers, 'catalog.view');
        return { data: 'leak' };
      });
    }`,
    );
    assert.equal(checkAdminRoutes([routes]).failures.length, 1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
