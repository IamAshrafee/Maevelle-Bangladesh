import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { clearTimeout } from 'node:timers';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

if (!process.env.CHECKOUT_07B_OUTPUT) throw new Error('Explicit local fixture output required.');
const output = process.env.CHECKOUT_07B_OUTPUT;
const fixture = JSON.parse(await readFile(join(output, 'fixture.json'), 'utf8'));
if (
  new URL(fixture.databaseUrl).port !== '5548' ||
  !new URL(fixture.databaseUrl).pathname.startsWith('/maevelle_cart01a_')
)
  throw new Error('Wrong disposable target.');
const cases = [],
  network = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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
async function tab() {
  const target = await (
    await fetch('http://127.0.0.1:9238/json/new?about:blank', { method: 'PUT' })
  ).json();
  const c = await connect(target.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  await c.send('Network.enable');
  c.on('Network.requestWillBeSent', (p) => {
    const u = new URL(p.request.url);
    if (['http:', 'https:'].includes(u.protocol))
      network.push({
        host: u.host,
        path: u.pathname,
        method: p.request.method,
        canaryOutsideLocal:
          !['localhost', '127.0.0.1'].includes(u.hostname) &&
          String(p.request.postData ?? '').includes('PII-CANARY'),
      });
  });
  return c;
}
async function check(name, fn) {
  const start = performance.now();
  await fn();
  cases.push({ name, status: 'PASS', durationMs: Math.round(performance.now() - start) });
  console.log('PASS', name);
}
for (const old of await (await fetch('http://127.0.0.1:9238/json/list')).json())
  if (/^http:\/\/localhost:300[01]\//.test(old.url))
    await fetch(`http://127.0.0.1:9238/json/close/${old.id}`);
const page = await tab();
await page.send('Network.clearBrowserCookies');
await page.send('Storage.clearDataForOrigin', {
  origin: 'http://localhost:3000',
  storageTypes: 'all',
});
await page.send('Page.bringToFront');
let second, admin;
try {
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await check('Anonymous UNKNOWN through actual Next proxy', async () => {
    await page.go('http://localhost:3000/policies/privacy');
    await page.wait(
      `!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Choose preferences')`,
    );
    const p = await page.prefs();
    assert.equal(p.scope, 'SESSION');
    assert.equal(p.purposes.ANALYTICS.effectiveDecision, 'UNKNOWN');
    assert.equal(p.observationToken, null);
  });
  await check(
    'Independent analytics grant and advertising refusal via visible controls',
    async () => {
      await page.click(page.button('Choose preferences'));
      await page.wait(`!!document.querySelector('dialog[open] input[type=checkbox]')`);
      assert.equal(
        await page.evaluate(
          `[...document.querySelectorAll('dialog[open] input[type=checkbox]')].filter(e=>e.checked).length`,
        ),
        0,
      );
      await page.click(
        `document.querySelector('dialog[open] input[type=checkbox]').closest('label')`,
      );
      await page.click(page.button('Save selected purposes'));
      await page.wait(
        `document.querySelector('dialog[open]').textContent.includes('Privacy choices saved')`,
      );
      const p = await page.prefs();
      assert.equal(p.purposes.ANALYTICS.effectiveDecision, 'GRANTED');
      assert.equal(p.purposes.ADVERTISING.effectiveDecision, 'DENIED');
      assert.equal(p.externalDispatchEnabled, false);
      await page.screenshot('privacy-390');
    },
  );
  await check('Mobile tablet desktop landscape and text reflow', async () => {
    for (const [width, height] of [
      [320, 844],
      [390, 844],
      [768, 1024],
      [1280, 900],
      [844, 390],
    ]) {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const geometry = await page.evaluate(
        `(()=>{const d=document.querySelector('dialog[open]');return{overflow:Math.max(d.scrollWidth-d.clientWidth,document.documentElement.scrollWidth-innerWidth),height:d.getBoundingClientRect().height,viewport:innerHeight};})()`,
      );
      assert.ok(geometry.overflow <= 1, JSON.stringify({ width, ...geometry }));
      assert.ok(geometry.height <= height + 1);
    }
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 320,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.evaluate(`document.documentElement.style.fontSize='200%'`);
    assert.ok(
      await page.evaluate(
        `document.querySelector('dialog[open]').scrollWidth<=document.querySelector('dialog[open]').clientWidth+1`,
      ),
    );
    await page.screenshot('privacy-320-text-200');
    await page.evaluate(`document.documentElement.style.fontSize=''`);
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
    assert.equal(
      await page.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),
      true,
    );
  });
  await check('Keyboard focus containment and Escape', async () => {
    await page.click(page.button('Close'));
    await page.wait(`!document.querySelector('dialog[open]')`);
    const opener = await page.evaluate(
      `[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.includes('Privacy choices'))?.textContent.trim()`,
    );
    assert.ok(opener);
    await page.click(page.button(opener));
    await page.wait(`!!document.querySelector('dialog[open] input')`);
    for (let i = 0; i < 12; i++) {
      await page.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      await page.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
      });
      assert.equal(await page.evaluate(`!!document.activeElement.closest('dialog[open]')`), true);
    }
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await page.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    });
    await page.wait(`!document.querySelector('dialog[open]')`);
    assert.ok(
      await page.evaluate(`document.activeElement.textContent.includes('Privacy choices')`),
    );
  });
  await check(
    'Authorized reload and proof-bound browser observation through actual proxy',
    async () => {
      await page.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.click(
        `[...document.querySelectorAll('a[href="/wishlist"]')].find(e=>e.getClientRects().length)`,
      );
      await page.wait(`!!document.querySelector('main')`);
      await delay(800);
      const p = await page.prefs();
      assert.equal(p.purposes.ANALYTICS.effectiveDecision, 'GRANTED');
      await page.go('http://localhost:3000/cart');
      await delay(800);
      const receipt = await page.evaluate(
        `(async()=>{const p=await fetch('/api/storefront/v1/analytics/consent',{headers:{'x-privacy-request':'1'}}).then(r=>r.json()).then(r=>r.data);return fetch('/api/storefront/v1/analytics/events',{method:'POST',headers:{'content-type':'application/json','x-privacy-context':p.context,'x-privacy-observation':p.observationToken},body:JSON.stringify({schemaVersion:1,eventId:crypto.randomUUID(),name:'WISHLIST_PAGE_VIEWED',origin:'BROWSER',occurredAt:new Date().toISOString(),sessionId:crypto.randomUUID(),consent:{necessary:'GRANTED',analytics:'GRANTED',marketing:'DENIED',preferences:'DENIED',recordedAt:p.observationNotBefore},data:{mode:'GUEST'}})}).then(async r=>({status:r.status,body:await r.json()}));})()`,
      );
      assert.equal(receipt.status, 202);
      assert.equal(receipt.body.data.accepted, true);
    },
  );
  await check('Stale revision cannot overwrite withdrawal in another tab', async () => {
    const old = await page.prefs();
    second = await tab();
    await second.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await second.go('http://localhost:3000/policies/privacy');
    await second.prefs();
    await delay(1000);
    await second.click(second.button('Privacy choices'));
    await second.wait(`!!document.querySelector('dialog[open] input')`);
    await second.click(second.button('Decline optional purposes'));
    await second.wait(
      `document.querySelector('dialog[open]').textContent.includes('Privacy choices saved')`,
    );
    const status = await page.evaluate(
      `fetch('/api/storefront/v1/analytics/consent',{method:'PUT',headers:{'content-type':'application/json','x-privacy-request':'1','x-privacy-context':${JSON.stringify(old.context)}},body:JSON.stringify({policyVersion:${JSON.stringify(old.policyVersion)},choices:{ANALYTICS:{decision:'GRANTED',expectedRevision:${JSON.stringify(old.purposes.ANALYTICS.revision)},expectedBrowserRevision:${JSON.stringify(old.purposes.ANALYTICS.browserRevision)}},ADVERTISING:{decision:'GRANTED',expectedRevision:${JSON.stringify(old.purposes.ADVERTISING.revision)},expectedBrowserRevision:${JSON.stringify(old.purposes.ADVERTISING.browserRevision)}}}})}).then(r=>r.status)`,
    );
    assert.equal(status, 409);
    assert.equal((await page.prefs()).purposes.ANALYTICS.effectiveDecision, 'DENIED');
  });
  await check('Offline save pauses locally and does not claim a server save', async () => {
    await page.go('http://localhost:3000/policies/privacy');
    await page.prefs();
    await delay(1000);
    await page.click(page.button('Privacy choices'));
    await page.wait(`!!document.querySelector('dialog[open] input')`);
    await page.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await page.click(page.button('Save selected purposes'));
    await page.wait(
      `document.querySelector('dialog[open]').textContent.includes('could not confirm the save')`,
    );
    assert.ok(
      !(await page.evaluate(
        `document.querySelector('dialog[open]').textContent.includes('Privacy choices saved')`,
      )),
    );
    await page.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page.click(page.button('Reload privacy choices'));
    await page.wait(`!!document.querySelector('dialog[open] input')`);
  });
  await check('Unavailable preference API stays paused and recovers', async () => {
    await page.click(page.button('Close'));
    await page.send('Network.setBlockedURLs', { urls: ['*analytics/consent*'] });
    await page.click(page.button('Privacy choices'));
    await page.wait(
      `document.querySelector('dialog[open]').textContent.includes('could not be loaded')`,
    );
    assert.equal(await page.evaluate(`!!document.querySelector('dialog[open] input')`), false);
    await page.send('Network.setBlockedURLs', { urls: [] });
    await page.click(page.button('Reload privacy choices'));
    await page.wait(`!!document.querySelector('dialog[open] input')`);
  });
  await check('Cleared preference cookie cannot submit old context', async () => {
    await page.send('Network.deleteCookies', {
      name: 'maevelle_privacy',
      url: 'http://localhost:3000/',
    });
    await page.click(page.button('Save selected purposes'));
    await page.wait(
      `document.querySelector('dialog[open]').textContent.includes('Review the current choices')`,
    );
    assert.equal((await page.prefs()).purposes.ANALYTICS.effectiveDecision, 'UNKNOWN');
  });
  await check('Real shopper account A refusal, account B isolation and logout', async () => {
    for (const label of ['A', 'B']) {
      const status = await page.evaluate(
        `fetch('/api/shopper-auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(fixture.users[label].email)},password:${JSON.stringify(fixture.password)}})}).then(r=>r.status)`,
      );
      assert.equal(status, 200);
      await page.go('http://localhost:3000/policies/privacy');
      await delay(500);
      const p = await page.prefs();
      assert.equal(p.scope, 'ACCOUNT');
      assert.equal(p.purposes.ANALYTICS.effectiveDecision, label === 'A' ? 'DENIED' : 'UNKNOWN');
    }
    assert.equal(
      await page.evaluate(
        `fetch('/api/shopper-auth/sign-out',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(r=>r.status)`,
      ),
      200,
    );
    await page.go('http://localhost:3000/policies/privacy');
    await delay(300);
    assert.equal((await page.prefs()).scope, 'SESSION');
    assert.equal((await page.prefs()).observationToken, null);
  });
  await check('Admin permissions, real aggregate reporting and synthetic exclusion', async () => {
    admin = await tab();
    await admin.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await admin.go('http://localhost:3001/admin/login');
    for (const role of ['reader', 'owner']) {
      const status = await admin.evaluate(
        `fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(fixture.users[role].email)},password:${JSON.stringify(fixture.password)}})}).then(r=>r.status)`,
      );
      assert.equal(status, 200);
      await admin.go('http://localhost:3001/admin/analytics?view=commerce');
      if (role === 'reader')
        await admin.wait(
          `document.body.textContent.includes('Financial analytics access required')`,
        );
      else {
        await admin.wait(
          `document.body.textContent.includes('No commerce facts in this selection')`,
        );
        await admin.click(`document.querySelector('select[aria-label="Commerce traffic class"]')`);
        await admin.evaluate(
          `(()=>{const e=document.querySelector('select[aria-label="Commerce traffic class"]');e.value='SYNTHETIC';e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
        await admin.wait(`document.body.textContent.includes('Payments independently verified')`);
        assert.ok(await admin.evaluate(`document.body.textContent.includes('BDT 40.0000')`));
        await admin.send('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
        });
        await admin.send('Input.dispatchKeyEvent', {
          type: 'keyUp',
          key: 'Escape',
          code: 'Escape',
          windowsVirtualKeyCode: 27,
        });
        await admin.screenshot('commerce-1280');
        for (const width of [390, 768, 1280]) {
          await admin.send('Emulation.setDeviceMetricsOverride', {
            width,
            height: 900,
            deviceScaleFactor: 1,
            mobile: false,
          });
          assert.ok(
            await admin.evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),
            `Admin overflow at ${width}`,
          );
        }
        await admin.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: 'dark' }],
        });
        assert.ok(await admin.evaluate(`document.body.textContent.includes('BDT 40.0000')`));
      }
    }
  });
  assert.equal(
    network.some((r) => /google-analytics|connect\.facebook|facebook\.com/.test(r.host)),
    false,
  );
  assert.equal(
    network.some((r) => r.canaryOutsideLocal),
    false,
  );
  await writeFile(
    join(output, 'browser-evidence.json'),
    JSON.stringify(
      {
        browser:
          'Dedicated Chromium CDP profile; actual local Next development proxies + Fastify + disposable PostgreSQL 18',
        cases,
        network: { requests: network.length, thirdPartyMarketingRequests: 0 },
        notVerified: [
          'Human assistive technology',
          'Physical touch devices',
          'Native browser zoom',
          'Successful public Order/payment flow',
          'Live vendor acceptance',
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  await page.screenshot('failure').catch(() => {});
  await writeFile(
    join(output, 'browser-failure.json'),
    JSON.stringify({ cases, error: error.message }, null, 2),
  );
  throw error;
} finally {
  page.close();
  second?.close();
  admin?.close();
}
