/** Run against the loopback synthetic storefront and a disposable CDP profile. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { browser, wait } from './cart-phase01b-cdp.mjs';

const handle = process.env.CART_02B_PRODUCT_HANDLE;
if (!handle || !/^cart-[a-z0-9-]+-choices$/.test(handle))
  throw new Error('A synthetic product handle is required');
const base = 'http://localhost:3000';
const chromium = await browser(9228);
const { browserContextId } = await chromium.send('Target.createBrowserContext');
const tab = await chromium.tab('about:blank', { browserContextId });
const status = (message) =>
  tab.evaluate(`document.body.innerText.includes(${JSON.stringify(message)})`);
const button = (label, root = 'document') =>
  `[...${root}.querySelectorAll('button')].find(e=>e.getClientRects().length && (e.textContent.trim()===${JSON.stringify(label)} || e.ariaLabel===${JSON.stringify(label)}))`;
async function until(label, predicate) {
  try {
    await wait(predicate);
  } catch (cause) {
    throw new Error(`Failed at ${label}`, { cause });
  }
}
async function click(expression, label = expression) {
  await until(label, () => tab.evaluate(`Boolean(${expression} && !${expression}.disabled)`));
  await tab.evaluate(`${expression}.click()`);
}
async function resize(width, height) {
  await tab.call('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}
async function read() {
  return tab.evaluate(
    `fetch('/api/storefront/v1/carts/current').then(r=>r.json()).then(r=>r.data)`,
  );
}
function resources() {
  return tab.evaluate(`performance.getEntriesByType('resource').map(entry=>({
    url:entry.name,bytes:entry.decodedBodySize
  }))`);
}
try {
  await resize(390, 844);
  await tab.navigate(`${base}/products/${handle}`);
  const add = 'document.querySelector("#pdp-mobile-inline-add-to-cart")';
  await until('required selection', () =>
    tab.evaluate(`${add}?.disabled && ${add}.innerText.includes("Select")`),
  );
  await until('initial Cart read', () =>
    tab.evaluate(`Boolean(document.querySelector('[aria-label="View shopping bag (0 items)"]'))`),
  );
  const initialResources = await resources();
  for (const [index, name] of ['Smooth', 'Textured'].entries()) {
    await until(`select ${name}`, async () => {
      await click(button(name));
      return tab.evaluate(`${button(name)}.getAttribute("aria-pressed") === "true"`);
    });
    await click(add);
    await until(
      `Add ${name}`,
      async () =>
        (await status('Added to your bag.')) &&
        (await tab.evaluate(
          `Boolean(document.querySelector('[aria-label="View shopping bag (${index + 1} items)"]'))`,
        )),
    );
  }
  const original = await read();
  assert.equal(original.lines.length, 2);
  const target = original.lines.find((line) =>
    line.options.some((option) => option.value === 'Textured'),
  );
  assert.ok(target);

  const trigger = `[...document.querySelectorAll('button[aria-label^="View shopping bag"]')].find(e=>e.getClientRects().length)`;
  await tab.evaluate(`${trigger}.focus()`);
  const beforeDrawer = await resources();
  const drawerStart = performance.now();
  await click(trigger, 'header bag');
  await until('drawer opens', () =>
    tab.evaluate(`Boolean(document.querySelector('dialog[open] a[href="/cart"]'))`),
  );
  const drawerMs = performance.now() - drawerStart;
  const afterDrawer = await resources();
  const scripts = (entries) =>
    entries.filter(({ url }) => url.includes('/_next/static/') && url.endsWith('.js'));
  const drawerScripts = scripts(afterDrawer).filter(
    ({ url }) => !beforeDrawer.some((entry) => entry.url === url),
  );
  const cartReads = (entries) =>
    entries.filter(({ url }) => url.endsWith('/api/storefront/v1/carts/current')).length;
  assert.equal(await tab.evaluate('document.activeElement.ariaLabel'), 'Close shopping bag');
  assert.equal(
    await tab.evaluate(
      'document.querySelector("dialog[open]").innerText.includes("Items in bag · 2")',
    ),
    true,
  );
  await tab.call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await until('Escape and focus restoration', () =>
    tab.evaluate(`!document.querySelector("dialog[open]") && document.activeElement===${trigger}`),
  );
  await click(trigger);
  await until('drawer link', () =>
    tab.evaluate(`Boolean(document.querySelector('dialog[open] a[href="/cart"]'))`),
  );
  await tab.evaluate(`document.querySelector('dialog[open] a[href="/cart"]').click()`);
  await until('bag page', () => status('Merchandise summary'));

  await click(button('Change selection'));
  await until('public variant options', () =>
    tab.evaluate(
      `[...document.querySelectorAll("main select option")].some(option=>option.value===${JSON.stringify(target.variantId)})`,
    ),
  );
  await tab.evaluate(`(()=>{
    const select=document.querySelector("main select");
    select.value=${JSON.stringify(target.variantId)};
    select.dispatchEvent(new Event("change",{bubbles:true}));
  })()`);
  await until('collision preview', () => status('Matching items will combine into one line of 2.'));

  // Let the actual API commit, then simulate losing that successful response in this tab.
  await tab.evaluate(`(()=>{
    const send=window.fetch.bind(window);
    window.replacementAttempts=[];
    window.fetch=async (url,init)=>{
      if(init?.method!=="PUT" || !String(url).endsWith("/variant")) return send(url,init);
      window.replacementAttempts.push({body:init.body,key:init.headers["idempotency-key"]});
      const response=await send(url,init);
      if(window.replacementAttempts.length===1 && response.ok) throw new TypeError("Simulated lost response");
      return response;
    };
  })()`);
  await click(button('Save selection'));
  await until('unknown replacement outcome', () => status('It may already be saved.'));
  await click(button('Retry same action'));
  await until('replacement confirmation', async () => {
    const current = await read();
    return (
      current?.lines.length === 1 &&
      Number(current.lines[0].quantity) === 2 &&
      !(await status('It may already be saved.'))
    );
  });
  const merged = await read();
  assert.equal(merged.lines[0].id, target.id);
  assert.equal(merged.version, original.version + 1);
  const attempts = await tab.evaluate('window.replacementAttempts');
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts[0], attempts[1]);

  await tab.evaluate(`(()=>{
    const input=document.querySelector('input[name="couponCode"]');
    input.value="CART01B10";
  })()`);
  await click(button('Apply'));
  await until('coupon benefit', () => status('current discount'));
  const discounted = await read();
  assert.equal(discounted.commerceReview.coupons[0].status, 'EFFECTIVE');

  const sibling = await chromium.tab(base + '/cart', { browserContextId });
  await until('other tab loads the same bag', () =>
    sibling.evaluate('document.body.innerText.includes("Items in bag · 2")'),
  );
  await click(button('Increase quantity', 'document.querySelector("main")'));
  await until('other tab refreshes after quantity change', () =>
    sibling.evaluate('document.body.innerText.includes("Items in bag · 3")'),
  );
  await sibling.close();

  for (const [width, height] of [
    [320, 600],
    [768, 900],
    [1440, 900],
  ]) {
    await resize(width, height);
    assert.ok(
      await tab.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
      `Horizontal overflow at ${width}`,
    );
  }
  if (process.env.CART_02B_FIXTURE_COMMERCE === '1') {
    async function changeFixture(name) {
      const result = await fetch(`http://127.0.0.1:3002/__fixture/${name}`, { method: 'POST' });
      assert.equal(result.status, 200);
      await tab.evaluate('window.dispatchEvent(new Event("online"))');
    }
    const beforeChange = await read();
    await changeFixture('reprice-and-expire');
    await until(
      'evaluation notice and ineffective coupon',
      async () =>
        (await status('Prices, offers or availability changed')) &&
        (await status('No current discount')),
    );
    const changed = await read();
    assert.equal(changed.intentRevision, beforeChange.intentRevision);
    assert.notEqual(changed.calculationFingerprint, beforeChange.calculationFingerprint);
    assert.equal(changed.lines[0].unitPrice, '157.0000');

    await changeFixture('invalidate');
    await until('invalid configuration is retained', () => status('This selection has changed.'));
    assert.equal((await read()).lines[0].availability, 'UNAVAILABLE');
    await click(button('Change selection'));
    await until('no public options', () => status('No other current selection is listed.'));
    await click(button('Remove Synthetic selectable clip from bag'));
    await until('safe removal', () => status('Your bag has coupons but no items.'));
  }

  await tab.navigate(base + '/checkout');
  await until('checkout boundary', () => status('Checkout is currently unavailable'));
  console.log(
    JSON.stringify({
      engine: chromium.version,
      result: 'PASS',
      widths: [320, 390, 768, 1440],
      collisionQuantity: 2,
      attempts: attempts.length,
      couponStatus: discounted.commerceReview.coupons[0].status,
      initialDecodedJsBytes: scripts(initialResources).reduce((sum, entry) => sum + entry.bytes, 0),
      drawerDecodedJsBytes: drawerScripts.reduce((sum, entry) => sum + entry.bytes, 0),
      drawerAdditionalCartReads: cartReads(afterDrawer) - cartReads(beforeDrawer),
      drawerOpenMs: Math.round(drawerMs),
    }),
  );
} finally {
  await chromium.send('Target.disposeBrowserContext', { browserContextId });
  chromium.close();
}
