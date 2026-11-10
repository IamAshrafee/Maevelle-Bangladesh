import { clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixturePassword } from './fixtures/browser-credentials.mjs';
const output = process.env.CHECKOUT_09A2_OUTPUT;
if (!output) throw Error('Explicit synthetic output required');
const fixture = JSON.parse(await readFile(join(output, 'fixture.json'), 'utf8'));
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const cases = [];
class Cdp {
  pending = new Map();
  sequence = 0;
  listeners = new Map();
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener('message', ({ data }) => {
      const m = JSON.parse(data);
      if (m.id) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.error) p.reject(new Error(m.error.message));
        else p.resolve(m.result);
      } else for (const f of this.listeners.get(m.method) ?? []) f(m.params);
    });
  }
  on(name, fn) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async wait(expression, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await this.evaluate(expression)) return;
      await delay(100);
    }
    throw new Error('Browser condition timed out');
  }
  async go(url) {
    await this.send('Page.navigate', { url });
    await this.wait(`document.readyState==='complete' && !!document.body`);
  }
  async click(expression) {
    await this.send('Page.bringToFront');
    await delay(200);
    const rect = await this.evaluate(
      `(()=>{const e=(${expression});if(!e)throw Error('Control missing');e.scrollIntoView({block:'center',behavior:'instant'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      button: 'left',
      clickCount: 1,
      ...rect,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      button: 'left',
      clickCount: 1,
      ...rect,
    });
  }
  button(label) {
    return `[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(label)})`;
  }
  async prefs() {
    return this.evaluate(
      `fetch('/api/storefront/v1/analytics/consent',{cache:'no-store',headers:{'x-privacy-request':'1'}}).then(async r=>{if(!r.ok)throw Error('Preference read '+r.status);return(await r.json()).data;})`,
    );
  }
  async screenshot(name) {
    const r = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    await writeFile(join(output, name + '.png'), Buffer.from(r.data, 'base64'));
  }
  close() {
    this.ws.close();
  }
}
async function connect(url) {
  const ws = new globalThis.WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  return new Cdp(ws);
}

const target = await (
  await fetch('http://127.0.0.1:9238/json/new?about:blank', { method: 'PUT' })
).json();
const page = await connect(target.webSocketDebuggerUrl);
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Network.enable');
const network = [];
page.on('Network.requestWillBeSent', (p) => {
  if (/google-analytics|facebook.com\/tr|connect.facebook/.test(p.request.url))
    network.push('MARKETING_REQUEST');
});
async function check(name, fn) {
  await fn();
  cases.push({ name, status: 'PASS' });
  console.log('PASS', name);
}
async function bodyText() {
  return page.evaluate('document.body.innerText');
}
try {
  await page.send('Network.clearBrowserCookies');
  await page.send('Storage.clearDataForOrigin', {
    origin: 'http://localhost:3000',
    storageTypes: 'all',
  });
  await page.go('http://localhost:3001/admin');
  await check('Real Admin sign-in through Next proxy', async () => {
    const status = await page.evaluate(
      `fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(fixture.users.owner.email)},password:${JSON.stringify(fixturePassword)}})}).then(r=>r.status)`,
    );
    assert.equal(status, 200);
  });
  await page.go(`http://localhost:3001/admin/payments/${fixture.paymentId}`);
  await page.wait(`document.body.innerText.includes('Settled with adjustment')`);
  await check(
    'Actual authorized COD81/cash80/waiver1/due0 read and disabled new application',
    async () => {
      const text = await bodyText();
      for (const t of [
        '৳81',
        '৳80',
        '৳1',
        '৳0',
        'Settled with adjustment',
        'Actual funds received',
      ])
        assert(text.includes(t), t);
      assert(
        await page.evaluate(
          `[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Settle small cash difference')&&b.disabled)`,
        ),
      );
    },
  );
  for (const width of [320, 390, 768, 1280])
    await check(`Cash settlement viewport ${width}`, async () => {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(150);
      assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      await page.screenshot(`cash-${width}`);
    });
  await check('Dark and forced-color financial view', async () => {
    await page.evaluate("document.documentElement.classList.add('dark')");
    await page.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.screenshot('cash-dark-forced');
    await page.send('Emulation.setEmulatedMedia', { features: [] });
  });
  await check(
    'Private history bounded and production command blocked through real API',
    async () => {
      const result = await page.evaluate(
        `(async()=>{const headers={'x-organization-id':${JSON.stringify(fixture.organizationId)}};const p=await fetch('/api/admin/payments/cash-policies',{headers,cache:'no-store'});const data=(await p.json()).data;const e=await fetch('/api/admin/payments/orders/${fixture.orderId}/cash-eligibility',{headers});const eligibility=(await e.json()).data;const bad=await fetch('/api/admin/payments/cash-shortfalls',{method:'POST',headers:{...headers,'content-type':'application/json','idempotency-key':crypto.randomUUID()},body:JSON.stringify({orderId:${JSON.stringify(fixture.orderId)},paymentId:${JSON.stringify(fixture.paymentId)},policyId:data.items[0].policyId,amount:'1',reason:'Synthetic browser blocked request',collectionEvidenceReference:'SYNTHETIC'})});return {status:bad.status,code:(await bad.json()).error.code,canApply:eligibility.canApply};})()`,
      );
      assert.deepEqual(result, { status: 422, code: 'POLICY_BLOCKED', canApply: false });
    },
  );
  await page.go('http://localhost:3001/admin/payments?tab=cash-policies');
  await page.wait("document.body.innerText.includes('synthetic-cash-v1')");
  await check('Reviewed policy remains visibly inactive', async () => {
    const text = await bodyText();
    assert(text.includes('activation blocked'));
    assert(text.includes('Gross') || text.includes('gross'));
    await page.screenshot('policies-1280');
  });
  await check('Policy proposal form is accessible without activating applications', async () => {
    await page.click(page.button('Propose cash policy'));
    await page.wait("!!document.querySelector('[role=dialog]')");
    assert(await page.evaluate("!!document.querySelector('input[name=accountingReference]')"));
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab' });
    assert(await page.evaluate('document.activeElement!==document.body'));
    await page.screenshot('policy-form');
    for (const width of [320, 768]) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await delay(150);
      assert(await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
      await page.screenshot(`policy-form-${width}`);
    }
    await page.click(page.button('Close'));
  });
  await page.go('http://localhost:3000/design-system');
  await page.wait("document.body.innerText.includes('Whole contract mismatch')");
  await check(
    'Real Storefront shared money whole/historical/mismatch/signed/unavailable specimens',
    async () => {
      const t = await bodyText();
      for (const v of ['৳299', '৳299.25', 'Amount needs review', '৳−0.4000', 'Amount unavailable'])
        assert(t.includes(v), v);
      await page.screenshot('money-lab');
    },
  );
  await page.go(`http://localhost:3000/products/${fixture.handle}`);
  await page.wait("document.body.innerText.includes('৳299')");
  await check('Actual seeded PDP price is whole without decimal suffix', async () => {
    assert(!(await bodyText()).includes('299.0000'));
    await page.screenshot('pdp-whole');
  });
  await check('Actual PDP to Cart retains whole price and nonfinal evaluation', async () => {
    const add =
      "[...document.querySelectorAll('button')].find(b=>/add to bag/i.test(b.textContent)&&!b.disabled&&b.getClientRects().length)";
    await page.click(add);
    await page.wait('/Added to (your )?bag/i.test(document.body.innerText)');
    await page.go('http://localhost:3000/cart');
    await page.wait("document.body.innerText.includes('৳299')");
    assert(!(await bodyText()).includes('299.0000'));
    await page.screenshot('cart-whole');
  });
  await check('Public Checkout remains unavailable in actual Next route', async () => {
    await page.go('http://localhost:3000/checkout');
    await page.wait('/unavailable|not available|not yet|cannot/i.test(document.body.innerText)');
    assert(
      !(await page.evaluate(
        "[...document.querySelectorAll('button')].some(b=>/place order/i.test(b.textContent)&&!b.disabled)",
      )),
    );
    await page.screenshot('checkout-blocked');
  });
  await check('No live commerce marketing request', async () => assert.equal(network.length, 0));
  await writeFile(
    join(output, 'browser-evidence.json'),
    JSON.stringify(
      {
        date: '2026-11-10',
        mode: 'Actual local Next Admin/Storefront + Fastify + disposable PostgreSQL18; synthetic financial records only',
        cases,
        marketingRequests: network.length,
        notVerified: [
          'Successful public Checkout and collection',
          'Policy activation',
          'Native zoom and human screen reader/physical devices',
          'Full organization-switch UI and browser mutation recovery',
        ],
      },
      null,
      2,
    ),
  );
} catch (e) {
  await page.screenshot('failure').catch(() => {});
  await writeFile(
    join(output, 'browser-failure.json'),
    JSON.stringify({
      cases,
      error: e.message,
      layout: await page
        .evaluate(
          "({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *,[role=dialog] *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,14).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,40),right:e.getBoundingClientRect().right}))})",
        )
        .catch(() => null),
    }),
  );
  throw e;
} finally {
  page.close();
}
