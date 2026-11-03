/** Real Storefront + API + PostgreSQL acceptance; faults affect only the loopback proxy. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { browser, wait, delay } from './cart-phase01b-cdp.mjs';
const fixture = JSON.parse(readFileSync('/tmp/maevelle-cart01c/fixture.json'));
const base = 'http://localhost:3000',
  product = base + '/products/' + fixture.code;
const b = await browser(),
  results = [];
for (const target of (await b.send('Target.getTargets')).targetInfos.filter(
  (t) => t.type === 'page' && t.url.startsWith(base),
))
  await b.send('Target.closeTarget', { targetId: target.targetId });
for (const ctx of (await b.send('Target.getBrowserContexts')).browserContextIds)
  await b.send('Target.disposeBrowserContext', { browserContextId: ctx });
let latest;
const text = (t) => t.evaluate('document.body.innerText');
// Space acceptance probes so a fast synthetic suite does not exhaust the real shared-IP limiter.
const api = async (t, path = '/current', method = 'GET', body, headers = {}) => {
  await delay(250);
  return t.evaluate(
    `(async()=>{const r=await fetch('/api/storefront/v1/carts'+${JSON.stringify(path)},${JSON.stringify({ method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })});return{status:r.status,body:await r.json()};})()`,
  );
};
const fault = (mode) => fetch(base + '/__cart01br/mode/' + mode);
const release = () => fetch(base + '/__cart01br/release');
const status = async () => await (await fetch(base + '/__cart01br/status')).json();
const quantity = (r) => Number(r.body.data?.lines[0]?.quantity ?? 0);
async function click(t, label) {
  await wait(() =>
    t.evaluate(
      `!![...document.querySelectorAll('button')].find(x=>(x.innerText.trim()===${JSON.stringify(label)}||x.ariaLabel===${JSON.stringify(label)})&&!x.disabled)`,
    ),
  );
  await t.evaluate(
    `(()=>{const e=[...document.querySelectorAll('button')].find(x=>(x.innerText.trim()===${JSON.stringify(label)}||x.ariaLabel===${JSON.stringify(label)})&&!x.disabled);e.click();})()`,
  );
}
async function fresh() {
  const ctx = (await b.send('Target.createBrowserContext')).browserContextId;
  const t = await b.tab(product, { browserContextId: ctx });
  latest = t;
  await t.call('Page.bringToFront');
  await wait(() =>
    t.evaluate(
      '!!document.querySelector("#pdp-mobile-inline-add-to-cart")&&!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled',
    ),
  );
  return { t, ctx };
}
async function added() {
  const p = await fresh();
  await click(p.t, 'Add to Bag');
  await wait(async () => quantity(await api(p.t)) === 1);
  await p.t.navigate(base + '/cart');
  await wait(() =>
    p.t.evaluate('!![...document.querySelectorAll("button")].find(e=>e.innerText==="Clear bag")'),
  );
  return p;
}
async function clear(t) {
  await click(t, 'Clear bag');
  await wait(() => t.evaluate('!!document.querySelector("dialog[open]")'));
  await click(t, 'Clear items and coupons');
}
async function reset(t) {
  await click(t, 'Start a new bag on this browser');
  await click(t, 'Forget this browser’s bag session');
}
async function check(name, fn) {
  if (
    process.env.CART_01BR_SCENARIOS &&
    !process.env.CART_01BR_SCENARIOS.split(',').includes(name.split(' ')[0])
  )
    return;
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', detail });
    console.log('PASS ' + name);
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message });
    const detail = await latest
      ?.evaluate(
        '({active:document.activeElement?.outerHTML?.slice(0,250),focus:document.hasFocus(),feedback:document.getElementById("cart-feedback")?.innerText,dialogs:document.querySelectorAll("dialog[open]").length})',
      )
      .catch(() => null);
    console.log('FAIL ' + name + ': ' + e.message + ' ' + JSON.stringify(detail));
  } finally {
    await release();
    await fault('none');
    for (const ctx of (await b.send('Target.getBrowserContexts')).browserContextIds)
      await b.send('Target.disposeBrowserContext', { browserContextId: ctx });
  }
}
await check('BR18 Clear selected coupons and items together through the customer UI', async () => {
  const { t } = await added();
  await t.evaluate('document.querySelector("#cart-coupon-input").value="CART01B10"');
  await click(t, 'Apply');
  await wait(async () => (await api(t)).body.data.appliedCoupons.length === 1);
  await clear(t);
  await wait(async () => (await api(t)).body.data.lines.length === 0);
  const view = (await api(t)).body.data;
  assert.deepEqual(view.appliedCoupons, []);
  await wait(() => t.evaluate('document.body.innerText.includes("Your bag was cleared")'));
  await wait(() => t.evaluate('document.activeElement.id==="cart-feedback"'));
});
await check(
  'BR19 Empty Clear is a consumed no-op and exact same-key replay preserves revision',
  async () => {
    const { t } = await added();
    await clear(t);
    await wait(async () => quantity(await api(t)) === 0);
    const view = (await api(t)).body.data;
    const body = { version: view.version, ownerContext: view.ownerContext },
      headers = { 'idempotency-key': randomUUID(), 'x-cart-context': view.ownerContext };
    const a = await api(t, '/current', 'DELETE', body, headers),
      z = await api(t, '/current', 'DELETE', body, headers);
    assert.equal(a.body.data.version, view.version);
    assert.deepEqual(a.body.data.outcome.changes, []);
    assert.equal(z.body.data.outcome.replayed, true);
  },
);
await check('BR20 Double activation of Clear confirms one intention and one request', async () => {
  const { t } = await added();
  const count = (await status()).events.length;
  await click(t, 'Clear bag');
  await t.evaluate(
    `(()=>{const e=[...document.querySelectorAll('dialog[open] button')].find(e=>e.innerText==='Clear items and coupons');e.click();e.click();})()`,
  );
  await wait(async () => quantity(await api(t)) === 0);
  const calls = (await status()).events
    .slice(count)
    .filter((e) => e.method === 'DELETE' && e.path === '/storefront/v1/carts/current');
  assert.equal(calls.length, 1);
});
await check(
  'BR21 Clear followed by explicit Add reuses valid authority and starts a new intention',
  async () => {
    const { t } = await added();
    await clear(t);
    await wait(async () => quantity(await api(t)) === 0);
    await t.navigate(product);
    await wait(() =>
      t.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled'),
    );
    await click(t, 'Add to Bag');
    await wait(async () => quantity(await api(t)) === 1);
  },
);
await check(
  'BR22 Response lost after committed Clear is recovered with the exact saved intent',
  async () => {
    const { t } = await added();
    await fault('lose-mutation');
    await clear(t);
    await wait(async () => (await text(t)).includes('Retry same action'));
    assert.equal(quantity(await api(t)), 0);
    const intent = JSON.parse(
      await t.evaluate('sessionStorage.getItem("maevelle_cart_pending_v1")'),
    );
    assert.equal(intent.command.kind, 'clear');
    await click(t, 'Retry same action');
    await wait(async () => !(await text(t)).includes('Retry same action'));
    const calls = (await status()).events.filter((e) => e.key === intent.key);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].path, calls[1].path);
    assert.equal(quantity(await api(t)), 0);
  },
);
await check(
  'BR23 Stale confirmation cannot Clear a newer quantity without renewed intention',
  async () => {
    const { t } = await added();
    await click(t, 'Clear bag');
    const old = (await api(t)).body.data;
    await api(
      t,
      '/current/lines/' + old.lines[0].id,
      'PATCH',
      { version: old.version, ownerContext: old.ownerContext, quantity: '2' },
      { 'idempotency-key': randomUUID(), 'x-cart-context': old.ownerContext },
    );
    await click(t, 'Clear items and coupons');
    await wait(async () => (await text(t)).includes('changed in another window'));
    assert.equal(quantity(await api(t)), 2);
    await clear(t);
    await wait(async () => quantity(await api(t)) === 0);
  },
);
await check(
  'BR24 Clear synchronizes another tab header using bounded nonsecret hints',
  async () => {
    const { t, ctx } = await added(),
      other = await b.tab(product, { browserContextId: ctx });
    await wait(() =>
      other.evaluate(
        '!![...document.querySelectorAll("a")].find(e=>e.ariaLabel==="View shopping bag (1 items)")',
      ),
    );
    const count = (await status()).events.length;
    await clear(t);
    await wait(() =>
      other.evaluate(
        '!![...document.querySelectorAll("a")].find(e=>e.ariaLabel==="View shopping bag (0 items)")',
      ),
    );
    const reads = (await status()).events.slice(count).filter((e) => e.method === 'GET');
    assert.ok(reads.length < 12);
    await other.close();
    return { postClearReads: reads.length };
  },
);
await check(
  'BR25 Actual database expiry offers deliberate cookie forgetting without automatic initialization',
  async () => {
    const { t, ctx } = await added();
    await t.evaluate(
      "fetch('/api/__fixture/expire',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})",
    );
    await t.navigate(base + '/cart');
    await wait(async () => (await text(t)).includes('Start a new bag on this browser'));
    const count = (await status()).events.length;
    await reset(t);
    await wait(async () => (await text(t)).includes('session was forgotten'));
    assert.equal((await api(t)).status, 404);
    assert.equal(
      (await b.send('Storage.getCookies', { browserContextId: ctx })).cookies.filter((c) =>
        c.name.includes('maevelle_cart'),
      ).length,
      0,
    );
    assert.equal(
      (await status()).events
        .slice(count)
        .filter((e) => e.method === 'POST' && e.path === '/storefront/v1/carts').length,
      0,
    );
  },
);
await check(
  'BR26 Browser credential eviction fails closed until explicit new-bag recovery',
  async () => {
    const { t, ctx } = await added();
    const cookies = (await b.send('Storage.getCookies', { browserContextId: ctx })).cookies.filter(
      (c) => c.name.includes('maevelle_cart'),
    );
    for (const c of cookies)
      await t.call('Network.deleteCookies', { name: c.name, domain: c.domain, path: c.path });
    await t.navigate(base + '/cart');
    await wait(async () => (await text(t)).includes('Start a new bag on this browser'));
    assert.equal((await api(t)).status, 404);
    await reset(t);
    await wait(async () => (await text(t)).includes('session was forgotten'));
  },
);
await check(
  'BR27 Reset racing a late bootstrap response fences both tabs without adopting the returned bag',
  async () => {
    const ctx = (await b.send('Target.createBrowserContext')).browserContextId;
    const a = await b.tab(),
      z = await b.tab();
    await a.close();
    await z.close();
    const one = await b.tab('about:blank', { browserContextId: ctx }),
      two = await b.tab('about:blank', { browserContextId: ctx });
    for (const t of [one, two])
      await t.call('Page.addScriptToEvaluateOnNewDocument', {
        source: 'Object.defineProperty(navigator,"locks",{value:undefined})',
      });
    await one.navigate(product);
    await wait(() =>
      one.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart")?.disabled'),
    );
    await fault('hold-init');
    await click(one, 'Add to Bag');
    await wait(async () => (await status()).held === 1);
    await two.call('Network.setCookie', {
      name: 'maevelle_cart',
      value: 'unproven',
      url: base,
      path: '/',
      httpOnly: true,
    });
    await two.navigate(base + '/cart');
    await wait(async () => (await text(two)).includes('Start a new bag on this browser'));
    await reset(two);
    await wait(async () => (await text(two)).includes('session was forgotten'));
    await release();
    await delay(250);
    await two.evaluate('dispatchEvent(new Event("focus"))');
    await wait(async () => (await text(two)).includes('returned from another window'));
    assert.equal(
      await one.evaluate('document.body.innerText.includes("Added to your bag.")'),
      false,
    );
    assert.equal((await api(two)).body.data.lines.length, 0);
  },
);
await check(
  'BR28 Real keyboard confirmation, Escape, focus containment and restoration',
  async () => {
    const { t } = await added();
    await t.call('Page.bringToFront');
    await t.evaluate(
      '[...document.querySelectorAll("button")].find(e=>e.innerText==="Clear bag").focus()',
    );
    await t.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      text: '\r',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await t.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      text: '\r',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await wait(() => t.evaluate('!!document.querySelector("dialog[open]")'));
    assert.equal(await t.evaluate('document.activeElement.innerText'), 'Cancel');
    for (let n = 0; n < 4; n++) {
      await t.call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      await t.call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      assert.ok(await t.evaluate('!!document.activeElement.closest("dialog[open]")'));
    }
    await t.call('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await t.call('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await wait(() => t.evaluate('!document.querySelector("dialog[open]")'));
    assert.equal(await t.evaluate('document.activeElement.innerText'), 'Clear bag');
  },
);
await check(
  'BR29 Offline Clear preflight fails without a mutation; reconnect rereads authoritative state',
  async () => {
    const { t } = await added();
    await t.call('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await clear(t);
    await wait(async () => (await text(t)).includes('Check bag again'));
    await t.call('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await click(t, 'Check bag again');
    await wait(async () => (await api(t)).status === 200);
    assert.equal(quantity(await api(t)), 1);
  },
);
await check(
  'BR30 503 Clear honors Retry-After and preserves the same intention for explicit retry',
  async () => {
    const { t } = await added();
    await fault('fail-mutation');
    await clear(t);
    await wait(async () => (await text(t)).includes('Retry same action'));
    assert.ok(
      await t.evaluate(
        '[...document.querySelectorAll("button")].find(e=>e.innerText==="Retry same action").disabled',
      ),
    );
    assert.equal(quantity(await api(t)), 1);
    await click(t, 'Retry same action');
    await wait(async () => quantity(await api(t)) === 0);
  },
);
await check(
  'BR31 Actual transport timeout after committed Clear recovers without duplicate effects',
  async () => {
    const { t } = await added();
    await fault('hang-mutation');
    await clear(t);
    await wait(async () => (await status()).held === 1);
    assert.equal(quantity(await api(t)), 0);
    await wait(async () => (await text(t)).includes('Retry same action'), 20000);
    await release();
    await click(t, 'Retry same action');
    await wait(async () => !(await text(t)).includes('Retry same action'));
    assert.equal(quantity(await api(t)), 0);
  },
);
await check(
  'BR32 Too many browser capability slots offer deliberate bounded session recovery',
  async () => {
    const ctx = (await b.send('Target.createBrowserContext')).browserContextId;
    await b.send('Storage.setCookies', {
      browserContextId: ctx,
      cookies: Array.from({ length: 33 }, () => ({
        name: 'maevelle_cart_' + randomUUID().replaceAll('-', ''),
        value: 'a'.repeat(43),
        url: base,
        path: '/',
        httpOnly: true,
      })),
    });
    const t = await b.tab(base + '/cart', { browserContextId: ctx });
    latest = t;
    await t.call('Page.bringToFront');
    await wait(async () => (await text(t)).includes('too many bag sessions'));
    await reset(t);
    await wait(async () => (await text(t)).includes('session was forgotten'));
    assert.equal((await api(t)).status, 404);
  },
);

await check(
  'BR33 Closing a tab after commit and reopening reads current state without replaying or duplicating it',
  async () => {
    const { t, ctx } = await fresh();
    await click(t, 'Add to Bag');
    await wait(async () => quantity(await api(t)) === 1);
    await fault('hold-mutation');
    await click(t, 'Add to Bag');
    await wait(async () => (await status()).held === 1);
    await t.close();
    const reopened = await b.tab(product, { browserContextId: ctx });
    latest = reopened;
    await reopened.call('Page.bringToFront');
    await wait(() =>
      reopened.evaluate(
        '[...document.querySelectorAll("a")].some(e=>e.ariaLabel==="View shopping bag (2 items)")',
      ),
    );
    assert.equal(quantity(await api(reopened)), 2);
    assert.equal(
      await reopened.evaluate('sessionStorage.getItem("maevelle_cart_pending_v1")'),
      null,
    );
    await release();
    assert.equal(quantity(await api(reopened)), 2);
  },
);

writeFileSync(
  process.env.CART_01BR_SCENARIOS
    ? '/tmp/maevelle-cart01c/browser-clear-reset-extra.json'
    : '/tmp/maevelle-cart01c/browser-clear-reset.json',
  JSON.stringify({ engine: b.version, results }, null, 2) + '\n',
);
b.close();
if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
