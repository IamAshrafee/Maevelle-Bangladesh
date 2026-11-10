import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { browser, wait, delay } from './cart-phase01b-cdp.mjs';
if (!process.env.CHECKOUT_07B_OUTPUT) throw new Error('Dedicated local fixture output required');
const c = await browser(9238),
  page = await c.tab(),
  cases = [];
let fault = null,
  lost = false,
  marketing = 0;
c.listen((event) => {
  if (event.sessionId !== page.sessionId) return;
  if (
    event.method === 'Network.requestWillBeSent' &&
    /google-analytics|facebook\.com/.test(event.params.request.url)
  )
    marketing++;
  if (event.method !== 'Fetch.requestPaused') return;
  const p = event.params;
  const handle = async () => {
    if (fault === 'LOST_WRITE' && p.request.method === 'PUT') {
      fault = null;
      lost = true;
      await page.call('Fetch.failRequest', {
        requestId: p.requestId,
        errorReason: 'ConnectionReset',
      });
    } else if (fault && p.request.method === 'GET')
      await page.call('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: fault === 'BROKEN_JSON' ? 200 : Number(fault),
        responseHeaders: [
          { name: 'content-type', value: 'application/json' },
          { name: 'cache-control', value: 'no-store' },
        ],
        body: Buffer.from(
          fault === 'BROKEN_JSON'
            ? '{'
            : '{"error":{"code":"SYNTHETIC_PROXY_FAULT","message":"Unavailable"}}',
        ).toString('base64'),
      });
    else await page.call('Fetch.continueRequest', { requestId: p.requestId });
  };
  void handle().catch(() => {});
});
const button = (label) =>
  `[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(label)})`;
async function click(expression) {
  await page.call('Page.bringToFront');
  await delay(200);
  const r = await page.evaluate(
    `(()=>{const e=(${expression});if(!e)throw Error('Missing control');e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  for (const type of ['mousePressed', 'mouseReleased'])
    await page.call('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...r });
}
const text = () => page.evaluate(`document.querySelector('dialog[open]')?.textContent??''`);
const prefs = () =>
  page.evaluate(
    `fetch('/api/storefront/v1/analytics/consent',{headers:{'x-privacy-request':'1'}}).then(r=>r.json()).then(r=>r.data)`,
  );
const check = async (name, fn) => {
  await fn();
  cases.push({ name, status: 'PASS' });
  console.log('PASS', name);
};
try {
  await page.call('Page.addScriptToEvaluateOnNewDocument', {
    source: `for(const key of ['localStorage','sessionStorage'])Object.defineProperty(window,key,{configurable:true,get(){throw new DOMException('Synthetic storage denial','SecurityError')}});`,
  });
  await page.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.navigate('http://localhost:3000/policies/privacy');
  await delay(1000);
  await check('Actual storage denial still permits server-confirmed refusal', async () => {
    await click(button('Privacy choices'));
    await wait(async () => await page.evaluate(`!!document.querySelector('dialog[open] input')`));
    await click(button('Decline optional purposes'));
    await wait(async () => (await text()).includes('Privacy choices saved'));
    assert.equal((await prefs()).purposes.ANALYTICS.effectiveDecision, 'DENIED');
    assert.equal(
      await page.evaluate(`(()=>{try{window.localStorage;return false}catch{return true}})()`),
      true,
    );
  });
  await page.call('Fetch.enable', {
    patterns: [{ urlPattern: '*analytics/consent*', requestStage: 'Response' }],
  });
  for (const status of ['429', '502', '503', 'BROKEN_JSON'])
    await check(`Preference ${status} never displays a grant and recovers`, async () => {
      await click(button('Close'));
      fault = status;
      await click(button('Privacy choices'));
      await wait(async () => (await text()).includes('could not be loaded'));
      assert.equal(await page.evaluate(`!!document.querySelector('dialog[open] input')`), false);
      fault = null;
      await click(button('Reload privacy choices'));
      await wait(async () => await page.evaluate(`!!document.querySelector('dialog[open] input')`));
    });
  await check(
    'Committed withdrawal with lost HTTP response is not reported saved and reloads durable refusal',
    async () => {
      await click(`document.querySelector('dialog[open] input').closest('label')`);
      await click(button('Save selected purposes'));
      await wait(async () => (await text()).includes('Privacy choices saved'));
      assert.equal((await prefs()).purposes.ANALYTICS.effectiveDecision, 'GRANTED');
      fault = 'LOST_WRITE';
      await click(button('Decline optional purposes'));
      await wait(async () => (await text()).includes('could not confirm the save'));
      assert.equal(lost, true);
      assert.equal((await prefs()).purposes.ANALYTICS.effectiveDecision, 'DENIED');
      await click(button('Reload privacy choices'));
      await wait(async () => await page.evaluate(`!!document.querySelector('dialog[open] input')`));
    },
  );
  await check(
    '400 percent CSS reflow and forced colors retain scrollable privacy controls',
    async () => {
      await page.call('Emulation.setDeviceMetricsOverride', {
        width: 320,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await page.evaluate(`document.documentElement.style.fontSize='400%'`);
      assert.ok(
        await page.evaluate(
          `document.querySelector('dialog[open]').scrollWidth<=document.querySelector('dialog[open]').clientWidth+1`,
        ),
      );
      await page.call('Emulation.setEmulatedMedia', {
        features: [{ name: 'forced-colors', value: 'active' }],
      });
      assert.equal(await page.evaluate(`matchMedia('(forced-colors: active)').matches`), true);
      const shot = await page.call('Page.captureScreenshot', { format: 'png' });
      await writeFile(
        join(process.env.CHECKOUT_07B_OUTPUT, 'privacy-400-forced-colors.png'),
        Buffer.from(shot.data, 'base64'),
      );
      await page.evaluate(`document.documentElement.style.fontSize=''`);
    },
  );
  assert.equal(marketing, 0);
  await writeFile(
    join(process.env.CHECKOUT_07B_OUTPUT, 'phase08-browser.json'),
    JSON.stringify(
      {
        browser: c.version,
        cases,
        marketingRequests: marketing,
        limitations: [
          'Loopback Next development proxy; no deployed HTTPS evidence',
          'Response-stage CDP injection represents actual lost browser HTTP response, not an unknown PostgreSQL commit',
          'CSS 400 percent is not native zoom or human AT',
          'No public purchase or collection enabled',
        ],
      },
      null,
      2,
    ),
  );
} catch (error) {
  const shot = await page.call('Page.captureScreenshot', { format: 'png' });
  await writeFile(
    join(process.env.CHECKOUT_07B_OUTPUT, 'phase08-browser-failure.png'),
    Buffer.from(shot.data, 'base64'),
  );
  const overflow = await page.evaluate(
    `(()=>{const d=document.querySelector('dialog[open]');return [...d.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,class:e.className,width:e.clientWidth,scroll:e.scrollWidth,text:e.textContent.slice(0,80)}));})()`,
  );
  console.log(JSON.stringify(overflow));
  throw error;
} finally {
  await page.close();
  c.close();
}
