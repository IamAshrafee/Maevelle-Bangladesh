/** Account Bag acceptance using a synthetic loopback fixture and disposable Chrome contexts. */
import assert from 'node:assert/strict';
import { browser, wait } from './cart-phase01b-cdp.mjs';

const handle = process.env.CART_02B_PRODUCT_HANDLE;
if (!handle || !/^cart-[a-z0-9-]+-choices$/.test(handle))
  throw new Error('Synthetic handle required');
const base = 'http://localhost:3000';
const current = '/api/storefront/v1/carts/account/current';
const chromium = await browser(9228);
const contexts = [];

async function newDevice() {
  const { browserContextId } = await chromium.send('Target.createBrowserContext');
  contexts.push(browserContextId);
  const tab = await chromium.tab('about:blank', { browserContextId });
  await tab.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  return tab;
}

async function until(label, predicate) {
  try {
    await wait(predicate, 12000);
  } catch (cause) {
    throw new Error(`Failed at ${label}`, { cause });
  }
}
const text = (tab, message) =>
  tab.evaluate(`document.body.innerText.includes(${JSON.stringify(message)})`);
const button = (label) =>
  `[...document.querySelectorAll('button')].find(e=>e.getClientRects().length && e.textContent.trim()===${JSON.stringify(label)})`;
async function click(tab, expression, label) {
  await until(label, () => tab.evaluate(`Boolean(${expression} && !${expression}.disabled)`));
  await tab.evaluate(`${expression}.click()`);
}
const clickButton = (tab, label) => click(tab, button(label), label);

async function signIn(tab, name = 'a') {
  await tab.navigate(base + '/account');
  await until('account sign-in form', () =>
    tab.evaluate('Boolean(document.querySelector("main form input[type=password]"))'),
  );
  await tab.evaluate(`(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [selector, value] of [
      ['main form input[type=email]', 'cart-shopper-${name}@example.test'],
      ['main form input[type=password]', 'synthetic-cart-browser-password'],
    ]) {
      const input = document.querySelector(selector);
      set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await clickButton(tab, 'Sign in');
  await until('verified account sign-in', () => text(tab, 'You are signed in.'));
}
async function add(tab, variant) {
  await tab.navigate(`${base}/products/${handle}`);
  const expression = 'document.querySelector("#pdp-mobile-inline-add-to-cart")';
  await until('PDP selection required', () => tab.evaluate(`Boolean(${expression}?.disabled)`));
  await until(variant, async () => {
    await clickButton(tab, variant);
    return tab.evaluate(`${button(variant)}?.getAttribute('aria-pressed') === 'true'`);
  });
  await click(tab, expression, 'PDP Add');
  await until('PDP add confirmed', () => text(tab, 'Added to your bag.'));
}
const read = (tab) =>
  tab.evaluate(`fetch(${JSON.stringify(current)}).then(r=>r.json()).then(r=>r.data)`);

async function recordCommit(tab, loseResponse) {
  await tab.evaluate(`(() => {
    const original = window.fetch.bind(window);
    window.mergeRequests = [];
    window.fetch = async (url, options) => {
      if (String(url).endsWith('/merge/commit')) {
        window.mergeRequests.push({ body: options.body, key: options.headers['idempotency-key'] });
        const response = await original(url, options);
        if (${loseResponse} && response.ok) throw new TypeError('Synthetic lost response');
        return response;
      }
      return original(url, options);
    };
  })()`);
}

try {
  const main = await newDevice();
  const device = await newDevice();
  await signIn(device);
  assert.equal(await read(device), undefined);
  await add(device, 'Textured');
  const original = await read(device);
  assert.equal(original.lines.length, 1);
  await add(main, 'Smooth');
  await add(main, 'Textured');
  const guest = await main.evaluate(
    "fetch('/api/storefront/v1/carts/current').then(r=>r.json()).then(r=>r.data)",
  );
  assert.equal(guest.lines.length, 2);
  const guestDevice = await newDevice();
  await add(guestDevice, 'Smooth');
  const secondGuest = await guestDevice.evaluate(
    "fetch('/api/storefront/v1/carts/current').then(r=>r.json()).then(r=>r.data)",
  );
  const { cookies } = await guestDevice.call('Network.getCookies', { urls: [base] });
  const secondSlot = cookies.find(
    ({ name }) => name === 'maevelle_cart_' + secondGuest.id.replaceAll('-', ''),
  );
  assert.ok(secondSlot);
  const imported = await main.call('Network.setCookie', {
    url: base,
    name: secondSlot.name,
    value: secondSlot.value,
    httpOnly: true,
    sameSite: 'Lax',
  });
  assert.equal(imported.success, true);
  await signIn(main);
  await main.navigate(base + '/cart');
  await until('persistent account bag after sign-in', () => text(main, 'Items in bag · 1'));
  const bagResources = await main.evaluate(
    `performance.getEntriesByType('resource').map(({name,decodedBodySize})=>({name,decodedBodySize}))`,
  );
  const cartReads = bagResources.filter(({ name }) => name.endsWith(current)).length;
  const guestReads = bagResources.filter(({ name }) =>
    name.endsWith('/api/storefront/v1/carts/current'),
  ).length;
  assert.equal(guestReads, 0);
  assert.equal((await read(main)).id, original.id);
  await main.navigate(base + '/cart/merge');
  await until('two independently issued guest slots', () => text(main, 'Review guest bag 2'));
  await clickButton(main, 'Review guest bag 1');
  await until('reviewed collision', () => text(main, '1 in account bag + 1 in guest bag = 2'));
  assert.equal((await read(main)).version, original.version);
  await click(
    main,
    `[...document.querySelectorAll('main a')].find(e=>e.textContent.trim()==='Keep bags separate')`,
    'Keep bags separate',
  );
  await until('kept bags separate', () =>
    main.evaluate(
      'location.pathname === "/cart" && document.querySelector("h1")?.textContent === "Your account bag" && document.body.innerText.includes("Items in bag · 1")',
    ),
  );
  await click(
    main,
    `[...document.querySelectorAll('main a')].find(e=>e.textContent.trim()==='Review guest bags')`,
    'Review guest bags',
  );
  await clickButton(main, 'Review guest bag 1');
  await until('review ready again', () => text(main, 'Your combined bag'));
  const changed =
    await device.evaluate(`fetch(${JSON.stringify(current + '/lines/' + original.lines[0].id)}, {
    method:'PATCH', headers: {'content-type':'application/json', 'idempotency-key':crypto.randomUUID()},
    body:JSON.stringify(${JSON.stringify({ ownerContext: original.ownerContext, version: original.version, quantity: '2' })})
  }).then(r=>r.status)`);
  assert.equal(changed, 200);
  await clickButton(main, 'Merge into my account bag');
  await until('stale review requires new consent', () =>
    text(main, 'Review the latest bags before trying again.'),
  );
  await clickButton(main, 'Review guest bag 1');
  await until('new collision proposal', () => text(main, '2 in account bag + 1 in guest bag = 3'));
  for (const width of [320, 390, 768, 1440]) {
    await main.call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 850,
      deviceScaleFactor: 1,
      mobile: width < 768,
    });
    assert.equal(
      await main.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'),
      true,
    );
  }

  await recordCommit(main, true);
  await clickButton(main, 'Merge into my account bag');
  await until('unknown response feedback', () => text(main, 'It may already be saved.'));
  const [attempt] = await main.evaluate('window.mergeRequests');
  assert.ok(attempt?.key);
  const committed = await read(main);
  assert.equal(committed.version, original.version + 2);
  assert.equal(
    Number(committed.lines.find((line) => line.id === original.lines[0].id).quantity),
    3,
  );
  const smooth = guest.lines.find((line) =>
    line.options.some((option) => option.value === 'Smooth'),
  );
  assert.ok(committed.lines.some((line) => line.id === smooth.id));

  await main.navigate(base + '/cart');
  await until('recovered merge journal on reload', () => text(main, 'Retry same action'));
  await recordCommit(main, false);
  await clickButton(main, 'Retry same action');
  await until('confirmed exact replay', () =>
    text(main, 'Guest bag merged into your account bag.'),
  );
  assert.deepEqual(await main.evaluate('window.mergeRequests'), [attempt]);
  assert.equal((await read(main)).version, committed.version);
  await device.navigate(base + '/cart');
  await until('second device sees merged bag', () => text(device, 'Items in bag · 4'));

  await main.navigate(base + '/account');
  await clickButton(main, 'Sign out');
  await until('signed out', () => text(main, 'You are signed out.'));
  const remaining = await main.evaluate(
    "fetch('/api/storefront/v1/carts/current').then(r=>r.json()).then(r=>r.data)",
  );
  assert.equal(remaining.id, secondGuest.id);
  assert.equal(remaining.version, secondGuest.version);
  await signIn(main, 'b');
  await main.navigate(base + '/cart');
  await until('separate account empty bag', () =>
    main.evaluate(
      'document.body.innerText.includes("Your account bag") && document.body.innerText.includes("Your bag is empty.")',
    ),
  );
  assert.equal(await read(main), undefined);
  assert.equal((await read(device)).id, original.id);
  await main.navigate(base + '/cart/merge');
  await clickButton(main, 'Review guest bag 1');
  await until('explicitly established empty account to review guest selections', () =>
    text(main, 'Your combined bag'),
  );
  assert.equal((await read(main)).lines.length, 0);
  assert.equal(await main.evaluate('document.activeElement?.getAttribute("role")'), 'status');
  const signedOut = await main.evaluate(`fetch('/api/shopper-auth/sign-out', {
    method:'POST', headers:{'content-type':'application/json'}, body:'{}',
  }).then(r=>r.status)`);
  assert.equal(signedOut, 200);
  await main.evaluate('window.dispatchEvent(new Event("focus"))');
  await until('lost session hides review without falling back to guest', () =>
    main.evaluate(
      'document.body.innerText.includes("Sign in again to access your account bag.") && !document.body.innerText.includes("Your combined bag")',
    ),
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      browser: chromium.version,
      widths: [320, 390, 768, 1440],
      distinctLinePreserved: true,
      collisionAccountLinePreserved: true,
      exactReplayAfterReload: true,
      staleReviewRequiresNewConsent: true,
      crossDeviceAndAccountSwitch: true,
      emptyAccountReviewAndLostSession: true,
      unrelatedGuestSlotPreserved: true,
      initialAccountBagReads: cartReads,
      initialGuestBagReads: guestReads,
    }),
  );
} finally {
  for (const browserContextId of contexts)
    await chromium.send('Target.disposeBrowserContext', { browserContextId });
  chromium.close();
}
