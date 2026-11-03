import { performance } from 'node:perf_hooks';
/** Local production-route sample; no CWV or pre/post improvement claim. */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { browser, wait } from './cart-phase01b-cdp.mjs';
const f = JSON.parse(readFileSync('/tmp/maevelle-cart01br/fixture.json'));
const b = await browser(),
  ctx = (await b.send('Target.createBrowserContext')).browserContextId;
const requests = [];
b.listen((e) => {
  if (
    e.method === 'Network.requestWillBeSent' &&
    e.params.request.url.includes('/api/storefront/v1/carts')
  )
    requests.push({
      method: e.params.request.method,
      path: new URL(e.params.request.url).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id'),
    });
});
const t = await b.tab('about:blank', { browserContextId: ctx });
await t.call('Page.bringToFront');
await t.call('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await t.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
await t.navigate('http://localhost:3000/products/' + f.code);
await wait(() =>
  t.evaluate(
    '!!document.querySelector("#pdp-mobile-inline-add-to-cart")&&!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled',
  ),
);
const ordinaryRequests = [...requests];
requests.length = 0;
await t.evaluate(
  'document.querySelector("#pdp-mobile-inline-add-to-cart").scrollIntoView({block:"center",behavior:"instant"})',
);
const target = await t.evaluate(
  '(()=>{const r=document.querySelector("#pdp-mobile-inline-add-to-cart").getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()',
);
const start = performance.now();
await t.call('Input.dispatchTouchEvent', {
  type: 'touchStart',
  touchPoints: [{ x: target.x, y: target.y }],
});
await t.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await wait(() =>
  t.evaluate(
    '[...document.querySelectorAll("a")].some(e=>e.ariaLabel==="View shopping bag (1 items)")',
  ),
);
const latencyMs = performance.now() - start;
const resources = await t.evaluate(
  'performance.getEntriesByType("resource").filter(e=>e.initiatorType==="script").map(e=>({path:new URL(e.name).pathname,decodedBytes:e.decodedBodySize,transferBytes:e.transferSize}))',
);
let estimatedGzipBytes = 0;
for (const r of resources) {
  try {
    estimatedGzipBytes += gzipSync(
      readFileSync('apps/storefront/.next' + r.path.replace('/_next', '')),
    ).length;
  } catch {
    /* External/dev-only resource is not counted as a local gzip estimate. */
  }
}
const result = {
  engine: b.version,
  profile:
    'Production build; local loopback fault proxy with identity encoding; one touch-emulated390px PDP sample',
  ordinaryCartRequests: ordinaryRequests,
  firstAddCartRequests: requests,
  observedScriptResources: resources,
  decodedScriptBytes: resources.reduce((s, r) => s + r.decodedBytes, 0),
  estimatedLocalGzipScriptBytes: estimatedGzipBytes,
  firstAddConfirmedHeaderLatencyMs: latencyMs,
  touchEmulation:
    'PASS: actual CDP touch start/end activates existing PDP Add; not hardware verification',
  limits:
    'No before/after bundle baseline, CWV, CLS, React Profiler, real mobile CPU/network or concurrency-load claim. Latency includes80ms polling granularity.',
};
writeFileSync(
  'docs/architecture/cart/phase01br-evidence/performance.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
await b.send('Target.disposeBrowserContext', { browserContextId: ctx });
b.close();
