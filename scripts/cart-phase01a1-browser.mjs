/** Actual HTTPS Set-Cookie + Chrome + PostgreSQL. No mocked Cookie request headers. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { browser, wait } from './cart-phase01b-cdp.mjs';
const f = JSON.parse(readFileSync('/tmp/maevelle-cart01a1/fixture.json', 'utf8'));
const b = await browser();
await b.send('Security.setIgnoreCertificateErrors', { ignore: true }); // disposable self-signed loopback only
const results = [];
const contexts = [];
async function page() {
  const { browserContextId } = await b.send('Target.createBrowserContext');
  contexts.push(browserContextId);
  return { t: await b.tab(f.origin, { browserContextId }), ctx: browserContextId };
}
async function api(t, path = '/storefront/v1/carts/current', method = 'GET', body, extra = {}) {
  return t.evaluate(
    `(async()=>{const r=await fetch(${JSON.stringify(path)},${JSON.stringify({ method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};})()`,
  );
}
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    console.log('PASS ' + name);
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message });
    console.log('FAIL ' + name + ': ' + e.message);
  }
}
async function cookies(ctx) {
  return (await b.send('Storage.getCookies', { browserContextId: ctx })).cookies;
}
async function add(t, view, quantity = '1', key = randomUUID()) {
  return api(
    t,
    '/storefront/v1/carts/current/lines',
    'POST',
    { version: view.version, ownerContext: view.ownerContext, variantId: f.variantId, quantity },
    { 'idempotency-key': key, 'x-cart-context': view.ownerContext },
  );
}
let old;
await check(
  'C01 actual legacy HttpOnly cookie survives cutover but cannot authorize or lose retained intent',
  async () => {
    old = await page();
    assert.equal((await api(old.t, '/__fixture/legacy', 'POST', {})).status, 200);
    assert.ok((await cookies(old.ctx)).find((c) => c.name === 'maevelle_cart')?.httpOnly);
    assert.equal(await old.t.evaluate('document.cookie.includes("maevelle_cart")'), false);
    assert.deepEqual((await api(old.t, '/__fixture/cutover', 'POST', {})).body.executed, [
      '3214_cart_credential_retirement',
    ]);
    for (const [path, method] of [
      ['/storefront/v1/carts/current', 'GET'],
      ['/storefront/v1/carts', 'POST'],
      ['/storefront/v1/checkouts', 'POST'],
    ]) {
      const r = await api(old.t, path, method, method === 'POST' ? {} : undefined);
      assert.equal(r.status, 401);
      assert.equal(r.body.data, undefined);
    }
    const retained = (await api(old.t, '/__fixture/retained')).body;
    assert.deepEqual(retained, {
      version: '2',
      credential_state: 'RETIRED',
      quantity: '2.000000',
      old_reader_matches: 0,
      receipts: 1,
    });
  },
);
await check(
  'C02 replay renamed into genuine browser __Host slot still cannot authorize or adopt',
  async () => {
    const p = await page();
    await api(p.t, '/__fixture/legacy', 'POST', { slot: true });
    assert.ok(
      (await cookies(p.ctx)).find((c) => c.name.startsWith('__Host-maevelle_cart_'))?.secure,
    );
    const r = await api(p.t);
    assert.equal(r.status, 401);
    assert.equal(r.body.data, undefined);
    assert.equal((await api(p.t, '/storefront/v1/carts', 'POST', {})).status, 401);
  },
);
let p, view, key;
await check(
  'C03 production HTTPS slot attributes, server bootstrap round-trip and exact lost-response recovery',
  async () => {
    p = await page();
    const initialized = await api(p.t, '/storefront/v1/carts', 'POST', {});
    assert.equal(initialized.status, 201);
    const jar = (await cookies(p.ctx)).filter((c) => c.name.includes('maevelle_cart'));
    assert.equal(jar.length, 1);
    assert.ok(jar[0].secure && jar[0].httpOnly);
    assert.equal(jar[0].path, '/');
    assert.equal(jar[0].sameSite, 'Lax');
    assert.equal(jar[0].domain, 'localhost');
    assert.match(jar[0].name, /^__Host-maevelle_cart_[0-9a-f]{32}$/);
    assert.ok(jar[0].expires > Date.now() / 1000 + 29 * 86400);
    assert.equal(await p.t.evaluate('document.cookie.includes("maevelle_cart")'), false);
    view = (await api(p.t)).body.data;
    key = randomUUID();
    const first = await add(p.t, view, '2', key);
    assert.equal(first.status, 200);
    const retry = await add(p.t, view, '2', key);
    assert.equal(retry.body.data.outcome.replayed, true);
    assert.equal(retry.body.data.lines[0].quantity, '2.000000');
    assert.equal(first.body.data.outcome.receiptId, retry.body.data.outcome.receiptId);
    view = retry.body.data;
  },
);
await check(
  'C04 mixed fixed/new credentials fail closed without deleting current acknowledged bag',
  async () => {
    await api(p.t, '/__fixture/legacy', 'POST', {});
    const r = await api(p.t);
    assert.equal(r.status, 401);
    assert.equal(r.body.data, undefined);
    await p.t.call('Network.deleteCookies', { name: 'maevelle_cart', url: f.origin });
    const recovered = await api(p.t);
    assert.equal(recovered.body.data.id, view.id);
    assert.equal(recovered.body.data.lines[0].quantity, '2.000000');
  },
);
await check(
  'C05 actual shopper A to B to logout never reads guest or attaches it to account',
  async () => {
    for (const who of ['a', 'b']) {
      if (who === 'b')
        assert.equal((await api(p.t, '/shopper-auth/sign-out', 'POST', {})).status, 200);
      const login = await api(p.t, '/shopper-auth/sign-in/email', 'POST', {
        email: `cart01a1-${who}@example.test`,
        password: f.password,
      });
      assert.equal(login.status, 200);
      for (const [path, method] of [
        ['/storefront/v1/carts/current', 'GET'],
        ['/storefront/v1/checkouts', 'POST'],
        ['/storefront/v1/checkouts/current', 'GET'],
      ]) {
        const r = await api(p.t, path, method, method === 'POST' ? {} : undefined);
        assert.equal(r.status, 409);
        assert.equal(r.body.error.code, 'ACCOUNT_CART_NOT_READY');
        assert.equal(r.body.data, undefined);
      }
    }
  },
);
await check(
  'C06 verified account mapping failure stays unavailable and cannot use returned guest cookie',
  async () => {
    await api(p.t, '/__fixture/suspend-b', 'POST', {});
    const r = await api(p.t);
    assert.equal(r.status, 503);
    assert.equal(r.body.data, undefined);
    assert.equal((await api(p.t, '/storefront/v1/checkouts', 'POST', {})).status, 503);
    await api(p.t, '/shopper-auth/sign-out', 'POST', {});
    const restored = await api(p.t);
    assert.equal(restored.body.data.id, view.id);
    assert.equal(restored.body.data.version, view.version);
  },
);
await check(
  'C07 concurrent browser retirement and mutation cannot resurrect old token or duplicate intent',
  async () => {
    const results = await Promise.all([
      api(p.t, '/__fixture/retire', 'POST', { ownerContext: view.ownerContext }),
      add(p.t, view, '1'),
    ]);
    assert.equal(results[0].status, 200);
    assert.ok([200, 401, 422].includes(results[1].status));
    const r = await api(p.t);
    assert.equal(r.status, 401);
    assert.equal(r.body.data, undefined);
    assert.equal((await add(p.t, view, '2', key)).body.data, undefined);
  },
);
await check(
  'C08 actual encrypted shopper-session TTL expiry refuses Cart and Checkout without guest fallback',
  async () => {
    const q = await page();
    const initial = await api(q.t, '/storefront/v1/carts', 'POST', {});
    assert.equal(initial.status, 201);
    assert.equal(
      (
        await api(q.t, '/shopper-auth/sign-in/email', 'POST', {
          email: 'cart01a1-a@example.test',
          password: f.password,
        })
      ).status,
      200,
    );
    assert.equal((await api(q.t)).body.error.code, 'ACCOUNT_CART_NOT_READY');
    assert.equal((await api(q.t, '/__fixture/expire-a', 'POST', {})).status, 200);
    for (const [path, method] of [
      ['/storefront/v1/carts/current', 'GET'],
      ['/storefront/v1/checkouts', 'POST'],
    ]) {
      const r = await api(q.t, path, method, method === 'POST' ? {} : undefined);
      assert.equal(r.status, 401);
      assert.equal(r.body.data, undefined);
    }
  },
);
await check(
  'C09 delayed actual legacy Set-Cookie cannot overwrite new slot, restore old authority or erase acknowledged quantity',
  async () => {
    const q = await page();
    await q.t.evaluate(
      `window.lateLegacy=fetch('/__fixture/legacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({hold:true})}).then(r=>r.json());true`,
    );
    await wait(async () => (await api(q.t, '/__fixture/held')).body.held);
    const initial = await api(q.t, '/storefront/v1/carts', 'POST', {});
    const current = (await api(q.t)).body.data;
    const added = await add(q.t, current);
    assert.equal(added.status, 200);
    await api(q.t, '/__fixture/release', 'POST', {});
    await q.t.evaluate('window.lateLegacy');
    const jar = (await cookies(q.ctx)).filter((c) => c.name.includes('maevelle_cart'));
    assert.equal(jar.length, 2);
    assert.ok(jar.every((c) => c.httpOnly));
    assert.equal((await api(q.t)).status, 401);
    await q.t.call('Network.deleteCookies', { name: 'maevelle_cart', url: f.origin });
    const retained = (await api(q.t)).body.data;
    assert.equal(retained.id, initial.body.data.id);
    assert.equal(retained.lines[0].quantity, '1.000000');
  },
);
mkdirSync('docs/architecture/cart/phase01a1-evidence', { recursive: true });
writeFileSync(
  'docs/architecture/cart/phase01a1-evidence/browser.json',
  JSON.stringify(
    {
      engine: b.version,
      database: f.databaseName,
      transport: 'HTTPS localhost; self-signed certificate accepted only in disposable Chrome',
      results,
    },
    null,
    2,
  ),
);
for (const browserContextId of contexts)
  await b.send('Target.disposeBrowserContext', { browserContextId });
b.close();
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
