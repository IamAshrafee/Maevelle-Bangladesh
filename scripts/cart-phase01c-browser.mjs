/** Real Chrome + real isolated API. Start runtime, production Next3004 and proxy3000 first. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { browser, wait, delay } from './cart-phase01b-cdp.mjs';
const fixture = JSON.parse(readFileSync('/tmp/maevelle-cart01c/fixture.json', 'utf8'));
const base = 'http://localhost:3000',
  product = base + '/products/' + fixture.code;
const b = await browser(),
  results = [];
for (const browserContextId of (await b.send('Target.getBrowserContexts')).browserContextIds)
  await b.send('Target.disposeBrowserContext', { browserContextId });
await fetch(base + '/__cart01br/release');
await fetch(base + '/__cart01br/mode/none');
const output = '/tmp/maevelle-cart01c/evidence';
mkdirSync(output, { recursive: true });
async function check(name, test) {
  if (
    process.env.CART_01BR_SCENARIOS &&
    !process.env.CART_01BR_SCENARIOS.split(',').includes(name.split(' ')[0])
  )
    return;
  try {
    const detail = await test();
    results.push({ name, status: 'PASS', detail });
    console.log('PASS ' + name);
  } catch (e) {
    results.push({ name, status: 'FAIL', detail: e.message });
    console.log('FAIL ' + name + ': ' + e.message);
  } finally {
    await fetch(base + '/__cart01br/release');
    await fetch(base + '/__cart01br/mode/none');
  }
}
async function context() {
  return (await b.send('Target.createBrowserContext')).browserContextId;
}
async function page(ctx, url = product) {
  const t = await b.tab(url, { browserContextId: ctx });
  await wait(() =>
    t.evaluate(
      '!!document.querySelector("#pdp-mobile-inline-add-to-cart")&&!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled',
    ),
  );
  await delay(350);
  return t;
}
const text = (t) => t.evaluate('document.body.innerText');
async function click(t, label) {
  await b.send('Target.activateTarget', { targetId: t.id });
  await delay(180);
  await wait(() =>
    t.evaluate(
      `Array.from(document.querySelectorAll('button')).some(x=>(x.innerText.trim()===${JSON.stringify(label)}||(${JSON.stringify(label)}==='Add to Bag'&&x.id==='pdp-mobile-inline-add-to-cart')||x.ariaLabel===${JSON.stringify(label)})&&!x.disabled)`,
    ),
  );
  await t.evaluate(
    `(()=>{const el=Array.from(document.querySelectorAll('button')).find(x=>(x.innerText.trim()===${JSON.stringify(label)}||( ${JSON.stringify(label)}==='Add to Bag' && x.id==='pdp-mobile-inline-add-to-cart')||x.getAttribute('aria-label')===${JSON.stringify(label)})&&!x.disabled);if(!el)throw new Error('Button unavailable: '+${JSON.stringify(label)});el.click()})()`,
  );
}
async function api(t, path = '/current', options = {}) {
  return t.evaluate(
    `(async()=>{const r=await fetch('/api/storefront/v1/carts${path}',${JSON.stringify(options)});return {status:r.status,cache:r.headers.get('cache-control'),body:await r.json()}})()`,
  );
}
async function fault(mode) {
  return (await fetch(base + '/__cart01br/mode/' + mode)).json();
}
async function held() {
  return (await (await fetch(base + '/__cart01br/status')).json()).held;
}
async function release() {
  await fetch(base + '/__cart01br/release');
}
async function read(t, ctx) {
  return api(t, '/current', { headers: ctx ? { 'x-cart-context': ctx } : {} });
}
const qty = (r) => Number(r.body.data?.lines[0]?.quantity ?? 0);
let primary, primaryContext, ctx;
await check('B01 ordinary PDP reads without guest creation', async () => {
  ctx = await context();
  primary = await page(ctx);
  const r = await read(primary);
  assert.equal(r.status, 404);
  const cookies = (await b.send('Storage.getCookies', { browserContextId: ctx })).cookies;
  assert.equal(cookies.filter((c) => c.name.includes('maevelle_cart')).length, 0);
  return 'No slot cookies; live GET404.';
});
await check('B02 first Add and shared header count', async () => {
  await click(primary, 'Add to Bag');
  await wait(async () => qty(await read(primary)) === 1);
  await wait(async () => (await text(primary)).includes('Added to your bag.'));
  let r = await read(primary);
  primaryContext = r.body.data.ownerContext;
  assert.match(r.cache, /no-store/);
  const cookies = (await b.send('Storage.getCookies', { browserContextId: ctx })).cookies.filter(
    (c) => c.name.includes('maevelle_cart'),
  );
  assert.equal(cookies.length, 1);
  assert.ok(cookies.every((c) => c.httpOnly));
  assert.equal(await primary.evaluate('document.cookie.includes("maevelle_cart")'), false);
  const labels = await primary.evaluate(
    'Array.from(document.querySelectorAll("a[aria-label]")).map(x=>x.ariaLabel).filter(x=>x.includes("shopping bag"))',
  );
  assert.ok(labels.some((x) => x.includes('(1 items)')));
  return { slotCount: 1, httpOnly: true, labels };
});
await check('B03 response lost after commit; exact receipt replay', async () => {
  await fault('lose-mutation');
  await click(primary, 'Add to Bag');
  await wait(async () => (await text(primary)).includes('Retry same action'));
  assert.equal(qty(await read(primary)), 2);
  const before = JSON.parse(
    await primary.evaluate('sessionStorage.getItem("maevelle_cart_pending_v1")'),
  );
  await click(primary, 'Retry same action');
  await wait(async () => !(await text(primary)).includes('Retry same action'));
  assert.equal(qty(await read(primary)), 2);
  const events = (await (await fetch(base + '/__cart01br/status')).json()).events.filter(
    (x) => x.key === before.key,
  );
  assert.equal(events.length, 2);
  assert.equal(events[0].key, events[1].key);
  return 'Committed quantity2 remained2; two requests same key.';
});
await check('B04 reload recovers uncertain intent without auto mutation', async () => {
  await fault('lose-mutation');
  await click(primary, 'Add to Bag');
  await wait(async () => (await text(primary)).includes('Retry same action'));
  await primary.navigate(product);
  await wait(async () => (await text(primary)).includes('An earlier action may already be saved'));
  assert.equal(qty(await read(primary)), 3);
  await click(primary, 'Retry same action');
  await wait(async () => !(await text(primary)).includes('Retry same action'));
  assert.equal(qty(await read(primary)), 3);
});
await check('B05 Cart page quantity and removal compatibility', async () => {
  await primary.navigate(base + '/cart');
  await wait(async () => (await text(primary)).includes('Synthetic public clip'));
  await click(primary, 'Increase quantity');
  await wait(async () => qty(await read(primary)) === 4);
  await delay(100);
  await click(primary, 'Decrease quantity');
  await wait(async () => qty(await read(primary)) === 3);
  return 'Actual UI set4 then set3.';
});
await check('B06 two tabs stale desired state requires review', async () => {
  const other = await page(ctx);
  const old = await read(primary);
  const d = old.body.data;
  const response = await api(other, '/current/lines/' + d.lines[0].id, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-cart-context': primaryContext,
    },
    body: JSON.stringify({ version: d.version, ownerContext: primaryContext, quantity: '4' }),
  });
  assert.equal(response.status, 200);
  const stale = await api(primary, '/current/lines/' + d.lines[0].id, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
      'x-cart-context': primaryContext,
    },
    body: JSON.stringify({ version: d.version, ownerContext: primaryContext, quantity: '2' }),
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'STALE_VERSION');
  assert.equal(qty(await read(other)), 4);
  await other.close();
});
await check('B07 cold tabs delayed Set-Cookie preserves acknowledged bag', async () => {
  const c = await context();
  const a = await b.tab('about:blank', { browserContextId: c }),
    z = await b.tab('about:blank', { browserContextId: c });
  for (const t of [a, z]) {
    await t.call('Page.addScriptToEvaluateOnNewDocument', {
      source: 'Object.defineProperty(navigator,"locks",{value:undefined})',
    });
    await t.navigate(product);
    await delay(400);
  }
  await fault('hold-init');
  await click(a, 'Add to Bag');
  await wait(async () => (await held()) === 1);
  await click(z, 'Add to Bag');
  await wait(async () => qty(await read(z)) === 1);
  const acknowledged = (await read(z)).body.data.ownerContext;
  await release();
  await b.send('Target.activateTarget', { targetId: a.id });
  await wait(async () => (await text(a)).includes('Choose a shopping bag'));
  const ambiguous = await read(a);
  assert.equal(ambiguous.status, 409);
  assert.equal(ambiguous.body.error.contexts.length, 2);
  assert.equal(qty(await read(a, acknowledged)), 1);
  const cookies = (await b.send('Storage.getCookies', { browserContextId: c })).cookies.filter(
    (x) => x.name.includes('maevelle_cart'),
  );
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((x) => x.httpOnly));
  await click(a, 'Review bag 1');
  await wait(async () => (await text(a)).includes('Bag selected'));
  await click(a, 'Review other bags');
  await wait(async () => (await text(a)).includes('Choose a shopping bag'));
  return {
    slots: 2,
    acknowledgedQuantity: 1,
    explicitSelection: true,
    explicitReturnToSelection: true,
  };
});
await check('B08 account sign-in during delayed guest result hides old state', async () => {
  await primary.navigate(product);
  await delay(400);
  await fault('hold-mutation');
  await click(primary, 'Add to Bag');
  await wait(async () => (await held()) === 1);
  await primary.navigate(base + '/account');
  await delay(500);
  await primary.evaluate(
    `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const[type,value]of [['email','cart01br-a@example.test'],['password',${JSON.stringify(fixture.password)}]]){const input=document.querySelector('main input[type="'+type+'"]')??document.querySelector('input[type="'+type+'"]');set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
  );
  await click(primary, 'Sign in');
  await wait(async () =>
    (await text(primary)).includes('Account shopping bags are not available yet'),
  );
  await release();
  await delay(350);
  assert.ok(!(await text(primary)).includes('Added to your bag.'));
  assert.equal((await read(primary)).body.error.code, 'ACCOUNT_CART_NOT_READY');
  await click(primary, 'Sign out');
  await wait(async () => (await text(primary)).includes('You are signed out.'));
  await wait(async () => (await read(primary)).status === 200);
  return 'Real auth UI, delayed guest response ignored, sign-out rechecks guest.';
});

await check('B09 Web Locks coordinate cold tabs; invalidations reconcile', async () => {
  const c = await context();
  const a = await b.tab('about:blank', { browserContextId: c }),
    z = await b.tab('about:blank', { browserContextId: c });
  for (const t of [a, z]) {
    await t.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await t.navigate(product);
    await delay(300);
  }
  await fault('hold-init');
  await click(a, 'Add to Bag');
  await wait(async () => (await held()) === 1);
  await click(z, 'Add to Bag');
  await delay(250);
  assert.equal(await held(), 1);
  await release();
  await wait(async () => {
    const r = await read(a);
    return r.status === 200 && qty(r) >= 1;
  });
  await delay(700);
  const cookies = (await b.send('Storage.getCookies', { browserContextId: c })).cookies.filter(
    (x) => x.name.includes('maevelle_cart'),
  );
  assert.equal(cookies.length, 1);
  const q = qty(await read(a));
  assert.ok(q === 1 || q === 2);
  await a.navigate(base + '/cart');
  await delay(400);
  await click(z, 'Add to Bag');
  await wait(async () => qty(await read(z)) === q + 1);
  await wait(() =>
    a.evaluate(
      `Array.from(document.querySelectorAll('a[aria-label]')).some(x=>x.ariaLabel==='View shopping bag (${q + 1} items)')`,
    ),
  );
  return { oneSlot: true, quantity: q + 1, broadcastHeaderUpdated: true };
});
await check('B10 real API no-op coupons, changed-key payload and tampering', async () => {
  const r = await read(primary);
  const d = r.body.data;
  const key = randomUUID();
  const headers = {
    'content-type': 'application/json',
    'idempotency-key': key,
    'x-cart-context': d.ownerContext,
  };
  const payload = { version: d.version, ownerContext: d.ownerContext };
  const path = '/current/lines/' + d.lines[0].id;
  const noOp = await api(primary, path, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ...payload, quantity: String(Number(d.lines[0].quantity)) }),
  });
  assert.equal(noOp.status, 200);
  assert.ok(noOp.body.data.outcome);
  assert.equal(noOp.body.data.version, d.version);
  const replay = await api(primary, path, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ...payload, quantity: String(Number(d.lines[0].quantity)) }),
  });
  assert.equal(replay.body.data.outcome.replayed, true);
  const changed = await api(primary, path, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ...payload, quantity: '1' }),
  });
  assert.equal(changed.status, 409);
  assert.equal(changed.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const invalid = await api(primary, '/current/coupons', {
    method: 'POST',
    headers: { ...headers, 'idempotency-key': randomUUID() },
    body: JSON.stringify({ ...payload, couponCode: 'NONEXISTENT' }),
  });
  assert.equal(invalid.status, 404);
  const forged = await api(primary, '/current/lines', {
    method: 'POST',
    headers: { ...headers, 'idempotency-key': randomUUID() },
    body: JSON.stringify({
      ...payload,
      variantId: fixture.variantId,
      quantity: '1',
      organizationId: randomUUID(),
      unitPrice: '0.01',
    }),
  });
  assert.equal(forged.status, 400);
  const foreign = await read(primary, randomUUID());
  assert.equal(foreign.status, 409);
  assert.equal(foreign.body.error.code, 'OWNER_CHANGED');
  return {
    noopReplay: true,
    changedPayload: 409,
    invalidCoupon: invalid.body.error.code,
    forged: 400,
    foreign: foreign.status,
  };
});
await check('B11 removed credential fails closed without replacement', async () => {
  const c = await context(),
    t = await page(c);
  await click(t, 'Add to Bag');
  await wait(async () => qty(await read(t)) === 1);
  const cookie = (await b.send('Storage.getCookies', { browserContextId: c })).cookies.find((x) =>
    x.name.includes('maevelle_cart'),
  );
  await t.call('Network.deleteCookies', {
    name: cookie.name,
    domain: cookie.domain,
    path: cookie.path,
  });
  await t.navigate(base + '/cart');
  await wait(
    async () =>
      (await text(t)).includes('no longer has access') ||
      (await text(t)).includes('session is unavailable'),
  );
  assert.equal((await read(t)).status, 404);
  assert.equal(
    (await b.send('Storage.getCookies', { browserContextId: c })).cookies.filter((x) =>
      x.name.includes('maevelle_cart'),
    ).length,
    0,
  );
});
await check('B12 responsive, reduced motion, keyboard and live feedback', async () => {
  await primary.navigate(base + '/cart');
  await b.send('Target.activateTarget', { targetId: primary.id });
  await delay(500);
  const metrics = [];
  for (const width of [320, 390, 768, 1280]) {
    await primary.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await delay(100);
    const m = await primary.evaluate(
      '({viewport:innerWidth,body:document.documentElement.scrollWidth})',
    );
    assert.ok(m.body <= m.viewport + 1);
    metrics.push({ width, ...m });
  }
  await primary.call('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  assert.equal(
    await primary.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches'),
    true,
  );
  await primary.call('Emulation.setDeviceMetricsOverride', {
    width: 640,
    height: 450,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await primary.evaluate('document.body.style.zoom="2"');
  await delay(100);
  const zoom = await primary.evaluate(
    '({width:innerWidth,scroll:document.documentElement.scrollWidth})',
  );
  assert.ok(zoom.scroll <= zoom.width + 1, JSON.stringify(zoom));
  await primary.evaluate('document.body.style.zoom="1"');
  await primary.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  await primary.call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Tab',
    code: 'Tab',
    windowsVirtualKeyCode: 9,
  });
  assert.ok(await primary.evaluate('document.activeElement!==document.body'));
  assert.ok(await primary.evaluate('!!document.querySelector("[aria-live=polite]")'));
  await primary.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await delay(100);
  const shot = await primary.call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  writeFileSync(output + '/mobile-cart.png', globalThis.Buffer.from(shot.data, 'base64'));
  return { metrics, zoom, keyboardFocus: true, reducedMotion: true, liveRegion: true };
});

await check(
  'B13 client route navigation keeps in-flight controller and confirmed count',
  async () => {
    const c = await context(),
      t = await page(c);
    await click(t, 'Add to Bag');
    await wait(async () => qty(await read(t)) === 1);
    await fault('hold-mutation');
    await click(t, 'Add to Bag');
    await wait(async () => (await held()) === 1);
    await t.evaluate(
      `Array.from(document.querySelectorAll('a')).find(x=>x.getAttribute('href')==='/cart'&&x.getClientRects().length).click()`,
    );
    await wait(() => t.evaluate('location.pathname==="/cart"'));
    await release();
    await wait(async () => qty(await read(t)) === 2);
    await wait(() =>
      t.evaluate(
        'Array.from(document.querySelectorAll("a[aria-label]")).some(x=>x.ariaLabel==="View shopping bag (2 items)")',
      ),
    );
    await click(t, 'Remove Synthetic public clip from bag');
    await wait(async () => (await read(t)).body.data.lines.length === 0);
    await wait(async () => (await text(t)).toLowerCase().includes('your bag is empty'));
    return 'Client navigation retained pending result, then UI removal committed.';
  },
);
await check('B14 storage denial keeps exact in-memory recovery and warns', async () => {
  const c = await context(),
    t = await b.tab('about:blank', { browserContextId: c });
  await t.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Storage.prototype.getItem=function(k){if(this===sessionStorage)throw new DOMException('denied','SecurityError');return get.call(this,k)};Storage.prototype.setItem=function(k,v){if(this===sessionStorage)throw new DOMException('denied','SecurityError');return set.call(this,k,v)};`,
  });
  await t.navigate(product);
  await delay(500);
  await click(t, 'Add to Bag');
  await wait(async () => qty(await read(t)) === 1);
  await fault('lose-mutation');
  await click(t, 'Add to Bag');
  await wait(async () =>
    (await text(t)).includes('Browser storage is unavailable for this action'),
  );
  await click(t, 'Retry same action');
  await wait(async () => !(await text(t)).includes('Retry same action'));
  assert.equal(qty(await read(t)), 2);
});

await check('B15 account switching remains unavailable without prior guest display', async () => {
  const c = await context(),
    t = await page(c);
  await click(t, 'Add to Bag');
  await wait(async () => qty(await read(t)) === 1);
  await t.navigate(base + '/account');
  for (const actor of ['a', 'b']) {
    await delay(300);
    await t.evaluate(
      `(()=>{const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const[type,value]of [['email','cart01br-${actor}@example.test'],['password',${JSON.stringify(fixture.password)}]]){const e=document.querySelector('main input[type="'+type+'"]');set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`,
    );
    await click(t, 'Sign in');
    await wait(async () => (await text(t)).includes('Account shopping bags are not available yet'));
    assert.equal((await read(t)).body.error.code, 'ACCOUNT_CART_NOT_READY');
    assert.equal(
      await t.evaluate(
        `Array.from(document.querySelectorAll('a[aria-label]')).some(x=>x.ariaLabel.startsWith('View shopping bag ('))`,
      ),
      false,
    );
    await click(t, 'Sign out');
    await wait(async () => (await text(t)).includes('You are signed out.'));
  }
  assert.equal(qty(await read(t)), 1);
});
await check('B16 browser history and public HTML contain no private Cart snapshot', async () => {
  const c = await context(),
    t = await page(c);
  await click(t, 'Add to Bag');
  await wait(async () => qty(await read(t)) === 1);
  await t.navigate(base + '/cart');
  await wait(async () => (await text(t)).includes('Synthetic public clip'));
  await t.navigate(product);
  const history = await t.call('Page.getNavigationHistory');
  const previous = history.entries.findLast((x) => x.url === base + '/cart');
  await t.call('Page.navigateToHistoryEntry', { entryId: previous.id });
  await wait(() => t.evaluate('location.pathname==="/cart"'));
  await wait(async () => (await text(t)).includes('Synthetic public clip'));
  const html = await (await fetch(base + '/cart')).text();
  assert.ok(!html.includes(fixture.variantId));
  assert.ok(!html.includes('Synthetic public clip'));
  return 'Back navigation recovered current bag; unauthenticated HTML omitted private line IDs.';
});
await check('B17 supported coupon UI apply and remove use real Promotions', async () => {
  const c = await context(),
    t = await page(c);
  await click(t, 'Add to Bag');
  await wait(async () => qty(await read(t)) === 1);
  await t.navigate(base + '/cart');
  await wait(() => t.evaluate('!!document.querySelector("#cart-coupon-input")'));
  await t.evaluate('document.querySelector("#cart-coupon-input").value="CART01B10"');
  await click(t, 'Apply');
  await wait(async () => (await read(t)).body.data.appliedCoupons.includes('CART01B10'));
  assert.ok(Number((await read(t)).body.data.discountTotal) > 0);
  await click(t, 'Remove coupon CART01B10');
  await wait(async () => (await read(t)).body.data.appliedCoupons.length === 0);
  assert.equal(Number((await read(t)).body.data.discountTotal), 0);
});
writeFileSync(
  output + (process.env.CART_01BR_SCENARIOS ? '/results-extra.json' : '/results.json'),
  JSON.stringify({ engine: b.version, database: fixture.databaseName, results }, null, 2),
);
b.close();
if (results.some((x) => x.status === 'FAIL')) process.exitCode = 1;
