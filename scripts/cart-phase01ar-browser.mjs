/** Browser-enforced HTTPS cookies against our disposable PostgreSQL-backed runtime. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { browser } from './cart-phase01b-cdp.mjs';
const f = JSON.parse(readFileSync('/tmp/maevelle-cart01ar/fixture.json', 'utf8'));
const results = [];
const b = await browser(9229);
const { browserContextId } = await b.send('Target.createBrowserContext');
const t = await b.tab(f.origin, { browserContextId });
const api = (path, method = 'GET', body, headers = {}) =>
  t.evaluate(
    `(async()=>{const r=await fetch(${JSON.stringify(path)},${JSON.stringify({ method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })});return {status:r.status,body:await r.json()};})()`,
  );
const cartCookies = async () =>
  (await b.send('Storage.getCookies', { browserContextId })).cookies.filter((c) =>
    c.name.includes('maevelle_cart'),
  );
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
  } catch (e) {
    results.push({ name, status: 'FAIL', message: e.message });
  }
}
let view;
await check(
  'BR01 late independent bootstrap cannot overwrite acknowledged intent; explicit selection resolves both slots',
  async () => {
    await t.evaluate(
      `window.lateCart=fetch('/storefront/v1/carts',{method:'POST',headers:{'content-type':'application/json','x-ar-delay':'late'},body:'{}'}).then(r=>r.json());true`,
    );
    const first = await api('/storefront/v1/carts', 'POST', {});
    assert.equal(first.status, 201);
    view = first.body.data;
    const added = await api(
      '/storefront/v1/carts/current/lines',
      'POST',
      {
        version: view.version,
        ownerContext: view.ownerContext,
        variantId: f.variantId,
        quantity: '2',
      },
      { 'idempotency-key': randomUUID() },
    );
    assert.equal(added.status, 200);
    view = added.body.data;
    await t.evaluate('window.lateCart');
    assert.equal((await cartCookies()).length, 2);
    assert.equal(
      (await api('/storefront/v1/carts/current')).body.error.code,
      'CART_CONTEXT_REQUIRED',
    );
    const selected = await api('/storefront/v1/carts/current', 'GET', undefined, {
      'x-cart-context': view.ownerContext,
    });
    assert.equal(selected.body.data.lines[0].quantity, '2.000000');
  },
);
await check(
  'BR02 production slots are HttpOnly Secure host-only Lax with no JavaScript token visibility',
  async () => {
    for (const c of await cartCookies()) {
      assert.ok(c.name.startsWith('__Host-'));
      assert.ok(c.httpOnly);
      assert.ok(c.secure);
      assert.equal(c.sameSite, 'Lax');
      assert.equal(c.path, '/');
      assert.equal(c.domain, 'localhost');
    }
    assert.equal(await t.evaluate('document.cookie.includes("maevelle_cart")'), false);
  },
);
await check(
  'BR03 actual browser Clear duplicate/replay commits one outcome and stale revisions fail',
  async () => {
    const key = randomUUID(),
      headers = { 'idempotency-key': key, 'x-cart-context': view.ownerContext },
      body = { version: view.version, ownerContext: view.ownerContext };
    const responses = await Promise.all([
      api('/storefront/v1/carts/current', 'DELETE', body, headers),
      api('/storefront/v1/carts/current', 'DELETE', body, headers),
    ]);
    for (const r of responses) {
      assert.equal(r.status, 200);
      assert.equal(r.body.data.lines.length, 0);
    }
    assert.equal(
      responses[0].body.data.outcome.receiptId,
      responses[1].body.data.outcome.receiptId,
    );
    assert.equal(responses.filter((r) => !r.body.data.outcome.replayed).length, 1);
    const stale = await api('/storefront/v1/carts/current', 'DELETE', body, {
      ...headers,
      'idempotency-key': randomUUID(),
    });
    assert.equal(stale.body.error.code, 'STALE_VERSION');
  },
);
await check(
  'BR04 explicit recovery expires actual HttpOnly slots and preserves stored carts/receipts',
  async () => {
    const before = (await api('/__fixture/counts')).body;
    assert.equal((await api('/storefront/v1/carts/session', 'DELETE', {})).status, 200);
    assert.equal((await cartCookies()).length, 0);
    assert.equal((await api('/storefront/v1/carts/current')).status, 404);
    assert.deepEqual((await api('/__fixture/counts')).body, before);
    const fresh = await api('/storefront/v1/carts', 'POST', {});
    assert.equal(fresh.status, 201);
    assert.notEqual(fresh.body.data.id, view.id);
  },
);
await b.send('Target.disposeBrowserContext', { browserContextId });
b.close();
const blocked = await browser(9230),
  reasons = [];
blocked.listen((e) => {
  if (e.method === 'Network.responseReceivedExtraInfo')
    for (const c of e.params.blockedCookies ?? []) reasons.push(...c.blockedReasons);
});
const tab = await blocked.tab(f.origin);
await check(
  'BR05 browser rejects first-party cookies; cold mutation cannot commit against returned public context',
  async () => {
    const result = await tab.evaluate(
      `(async()=>{const a=await fetch('/storefront/v1/carts',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const v=(await a.json()).data;const r=await fetch('/storefront/v1/carts/current/lines',{method:'POST',headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({version:v.version,ownerContext:v.ownerContext,variantId:${JSON.stringify(f.variantId)},quantity:'1'})});return {status:r.status,body:await r.json()};})()`,
    );
    assert.equal(result.body.error.code, 'SESSION_ESTABLISHMENT_REQUIRED');
    assert.equal(
      (await blocked.send('Storage.getCookies')).cookies.filter((c) =>
        c.name.includes('maevelle_cart'),
      ).length,
      0,
    );
    assert.ok(reasons.includes('UserPreferences'));
  },
);
await tab.close();
blocked.close();
const evidence = {
  engine: b.version,
  results,
  blockedReasons: [...new Set(reasons)],
  limitations:
    'Guest API protocol only; no Storefront UI, accessibility, Safari/Firefox, device eviction or background suspension acceptance.',
};
writeFileSync(
  new URL('../docs/architecture/cart/phase01ar-evidence/browser.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log(JSON.stringify(evidence, null, 2));
if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
