import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

// Run only against the explicit local Phase 03B API fixture with the unchanged Phase 05A policy gate.
if (
  process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55445/maevelle_test' ||
  !process.env.CHECKOUT_03B_OUTPUT
)
  throw new Error('The explicit disposable Checkout fixture is required.');
const fixture = JSON.parse(
  await readFile(join(process.env.CHECKOUT_03B_OUTPUT, 'fixture.json'), 'utf8'),
);
const origin = 'http://localhost:3000';
const debuggerBase = 'http://127.0.0.1:9227';
const target = await (
  await fetch(`${debuggerBase}/json/new?about:blank`, { method: 'PUT' })
).json();
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
const pending = new Map(),
  responses = [];
let sequence = 0;
ws.addEventListener('message', ({ data }) => {
  const m = JSON.parse(data);
  if (m.method === 'Network.responseReceived') {
    const r = m.params.response;
    if (/\/checkouts\/[^/]+\/(final-terms|placement)$/.test(r.url))
      responses.push({ operation: r.url.split('/').at(-1), status: r.status });
  }
  if (!m.id) return;
  const resolver = pending.get(m.id);
  if (!resolver) return;
  pending.delete(m.id);
  if (m.error) resolver.reject(new Error(m.error.message));
  else resolver.resolve(m.result);
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser assertion failed');
  return result.result.value;
}
async function eventually(expression, label) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      const result = await evaluate(expression);
      if (result) return result;
    } catch {
      /* Navigation may replace the context. */
    }
    await wait(100);
  }
  throw new Error(`Timed out: ${label}`);
}

async function setup(fixture, account, cart) {
  const key = () => globalThis.crypto.randomUUID();
  const request = async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch('/api' + path, {
      method,
      cache: 'no-store',
      credentials: 'include',
      headers: {
        ...(body ? { 'content-type': 'application/json', 'idempotency-key': key() } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`${path}: ${response.status} ${json.error?.code ?? ''}`);
    return json.data ?? json;
  };
  let partition = 'guest',
    context;
  if (account) {
    await request('/shopper-auth/sign-in/email', 'POST', {
      email: 'checkout03b-a@example.test',
      password: 'Synthetic-browser-password-123',
    });
    partition = (await request('/storefront/v1/shopper/session')).partition;
    if (!partition) throw new Error('Account partition unavailable');
  } else context = (await request('/storefront/v1/checkout/guest-sessions', 'POST', {})).id;
  const authority = account
    ? { 'x-shopper-partition': partition }
    : { 'x-checkout-context': context };
  let source = { kind: 'BUY_NOW', variantId: fixture.variantId, quantity: '1' };
  if (cart) {
    const base = '/storefront/v1/carts' + (account ? '/account' : '');
    const bag = await request(base, 'POST', {}, account ? authority : {});
    const observed = bag.lines.length
      ? bag
      : await request(
          base + '/current/lines',
          'POST',
          {
            version: bag.version,
            ownerContext: bag.ownerContext,
            variantId: fixture.variantId,
            quantity: '1',
          },
          { ...(account ? authority : {}), 'x-cart-context': bag.ownerContext },
        );
    source = { kind: 'CART', cartId: observed.id, cartRevision: observed.intentRevision };
  }
  const draft = await request('/storefront/v1/checkouts', 'POST', { source }, authority);
  const base = '/storefront/v1/checkouts/' + draft.id;
  const delivery = await request(
    base + '/delivery',
    'PUT',
    {
      revision: draft.revision,
      delivery: {
        recipientName: 'Synthetic buyer',
        mobile: '01700000000',
        geographyNodeId: fixture.areaId,
        addressLine1: 'Synthetic delivery',
      },
    },
    authority,
  );
  const quote = await request(base + '/quotes', 'POST', { revision: delivery.revision }, authority);
  const acknowledged = await request(
    base + '/quotes/' + quote.id + '/acknowledgements',
    'POST',
    {
      revision: quote.draftRevision,
      fingerprint: quote.fingerprint,
    },
    authority,
  );
  if (!acknowledged.acknowledged || acknowledged.facts.payable !== null)
    throw new Error('Expected component review');
  globalThis.sessionStorage.setItem(
    'maevelle_checkout_review_v1',
    JSON.stringify({
      version: 1,
      refs: [
        {
          partition,
          id: draft.id,
          revision: quote.draftRevision,
          context,
          handles: { [fixture.variantId]: fixture.handle },
          savedAt: Date.now(),
        },
      ],
      pending: [],
      guestContext: context,
    }),
  );
  const denied = await fetch('/api' + base + '/placement', {
    headers: authority,
    cache: 'no-store',
  });
  if (denied.status !== 404) throw new Error('An active draft must not expose order status');
  return true;
}

const outcomes = [];
try {
  await send('Page.enable');
  await send('Page.bringToFront');
  await send('Network.enable');
  await send('Runtime.enable');
  for (const [account, cart, width, method] of [
    [false, false, 320, 'COD'],
    [true, false, 390, 'BKASH_MANUAL'],
    [false, true, 768, 'NAGAD_MANUAL'],
    [true, true, 1440, 'COD'],
  ]) {
    await send('Network.clearBrowserCookies');
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.navigate', { url: origin + '/checkout' });
    await eventually(
      'location.pathname === "/checkout" && !!document.querySelector("#main-content")',
      'checkout page',
    );
    await evaluate('sessionStorage.clear()');
    await evaluate(`(${setup})(${JSON.stringify(fixture)},${account},${cart})`);
    await send('Page.reload', { ignoreCache: true });
    await eventually(
      '!!document.querySelector("#checkout-payment-method")',
      'payment method selector',
    );
    const button =
      'Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="Check availability")';
    await evaluate(
      `(() => { const s=document.querySelector("#checkout-payment-method"); s.focus(); s.value=${JSON.stringify(method)}; s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`,
    );
    await eventually(
      `(() => { const b=${button}; return !!b && !b.disabled; })()`,
      'ready method check',
    );
    const start = responses.length;
    await evaluate(`(${button}).focus()`);
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      text: '\r',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      text: '\r',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
    });
    await eventually(
      'document.querySelector("#checkout-final-payment")?.parentElement.innerText.includes("Ordering is unavailable. You can still review")',
      'backend policy block',
    );
    const layout = await evaluate(`(() => {
      const m=document.querySelector('#main-content'), b=${button};
      return { noOverflow:m.scrollWidth <= m.clientWidth+1, noPlace:![...m.querySelectorAll('button')].some(el=>el.textContent.trim()==='Place order'),
        noPaymentSecrets:!m.innerText.includes('Transaction ID'), targetHeight:b.getBoundingClientRect().height };
    })()`);
    assert.equal(layout.noOverflow, true);
    assert.equal(layout.noPlace, true);
    assert.equal(layout.noPaymentSecrets, true);
    assert.ok(layout.targetHeight >= 48);
    assert.deepEqual(responses.slice(start), [{ operation: 'final-terms', status: 503 }]);
    outcomes.push({
      account,
      cart,
      width,
      method,
      ...layout,
      finalTerms: 503,
      activeDraftStatusRead: 404,
    });
  }
  const facts = (await (await fetch('http://127.0.0.1:3002/__checkout03b/facts')).json()).data;
  for (const field of [
    'orders',
    'reservations',
    'obligations',
    'redemptions',
    'converted',
    'purchases',
    'confirmed_payments',
    'finance_postings',
    'purchase_events',
  ])
    assert.equal(facts[field], 0, field);
  console.log(JSON.stringify({ outcomes, facts }, null, 2));
} finally {
  ws.close();
  await fetch(`${debuggerBase}/json/close/${target.id}`).catch(() => undefined);
}
