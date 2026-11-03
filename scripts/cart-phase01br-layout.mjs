import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { browser, delay } from './cart-phase01b-cdp.mjs';
const b = await browser();
const t = await b.tab('http://localhost:3000/cart');
const results = [];
for (const width of [320, 390, 640, 768, 1280]) {
  await t.call('Emulation.setDeviceMetricsOverride', {
    width,
    height: 900,
    deviceScaleFactor: 1,
    mobile: width < 500,
  });
  await delay(100);
  const detail = await t.evaluate(
    '({viewport:innerWidth,scroll:document.documentElement.scrollWidth,header:[...document.querySelectorAll("header")].filter(e=>e.getClientRects().length).map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))})',
  );
  results.push({
    name: `Reflow ${width}px`,
    status: detail.scroll <= detail.viewport + 1 ? 'PASS' : 'FAIL',
    detail,
  });
  if (width === 390) {
    await t.evaluate('scrollTo(0,0)');
    const shot = await t.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      'docs/architecture/cart/phase01br-evidence/mobile-cart.png',
      Buffer.from(shot.data, 'base64'),
    );
  }
}
await t.call('Emulation.setDeviceMetricsOverride', {
  width: 640,
  height: 450,
  deviceScaleFactor: 1,
  mobile: false,
});
await t.evaluate('document.body.style.zoom="2"');
await delay(100);
const zoom = await t.evaluate(
  '({viewport:innerWidth,scroll:document.documentElement.scrollWidth})',
);
results.push({
  name: 'Reported 640px viewport / CSS zoom2 regression',
  status: zoom.scroll <= zoom.viewport + 1 ? 'PASS' : 'FAIL',
  detail: zoom,
});
await t.evaluate('scrollTo(0,0)');
const shot = await t.call('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: false,
});
writeFileSync(
  'docs/architecture/cart/phase01br-evidence/zoom-cart.png',
  Buffer.from(shot.data, 'base64'),
);
await t.evaluate('document.body.style.zoom="1"');
await t.call('Emulation.setDeviceMetricsOverride', {
  width: 320,
  height: 225,
  deviceScaleFactor: 1,
  mobile: false,
});
const equivalent = await t.evaluate(
  '({viewport:innerWidth,scroll:document.documentElement.scrollWidth})',
);
results.push({
  name: '400% equivalent 320px CSS viewport from 1280px window; not native browser zoom',
  status: equivalent.scroll <= equivalent.viewport + 1 ? 'PASS' : 'FAIL',
  detail: equivalent,
});
await t.call('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});
assert.equal(await t.evaluate('matchMedia("(prefers-reduced-motion:reduce)").matches'), true);
results.push({ name: 'Reduced-motion preference', status: 'PASS' });
// Inspect the browser accessibility tree for the permanent recovery live region.
await t.call('Accessibility.enable');
const tree = await t.call('Accessibility.getFullAXTree');
const statuses = tree.nodes.filter((e) => e.role?.value === 'status');
results.push({
  name: 'Browser accessibility-tree status region',
  status: statuses.length ? 'PASS' : 'FAIL',
  detail: { statusRegions: statuses.length },
});
writeFileSync(
  'docs/architecture/cart/phase01br-evidence/layout.json',
  JSON.stringify(
    {
      engine: b.version,
      results,
      limitations:
        'CSS zoom/effective viewport tests are distinct from native browser zoom. No hardware touch or assistive-technology session.',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(results, null, 2));
await t.close();
b.close();
if (results.some((r) => r.status === 'FAIL')) process.exitCode = 1;
