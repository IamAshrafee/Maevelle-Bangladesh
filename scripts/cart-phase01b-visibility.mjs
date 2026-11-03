/** Browser visibility events hide private Cart display and revalidate on return. */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { browser, wait, delay } from './cart-phase01b-cdp.mjs';
const f = JSON.parse(readFileSync('/tmp/maevelle-cart01b/fixture.json', 'utf8'));
const b = await browser(),
  c = (await b.send('Target.createBrowserContext')).browserContextId;
const a = await b.tab('http://localhost:3000/products/' + f.code, { browserContextId: c });
await wait(() => a.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled'));
await delay(250);
await a.evaluate('document.querySelector("#pdp-mobile-inline-add-to-cart").click()');
await wait(() => a.evaluate('document.body.innerText.includes("Added to your bag.")'));
await a.navigate('http://localhost:3000/cart');
await wait(() => a.evaluate('document.body.innerText.includes("Synthetic public clip")'));
const z = await b.tab('http://localhost:3000/account', { browserContextId: c });
await z.call('Page.bringToFront');
await a.call('Emulation.setFocusEmulationEnabled', { enabled: false });
let result;
try {
  await wait(() => a.evaluate('document.visibilityState==="hidden"'));
  await wait(() => a.evaluate('!document.body.innerText.includes("Synthetic public clip")'));
  assert.equal(
    await a.evaluate(
      'Array.from(document.querySelectorAll("a[aria-label]")).some(x=>x.ariaLabel==="View shopping bag (1 items)")',
    ),
    false,
  );
  await a.call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await wait(() => a.evaluate('document.body.innerText.includes("Synthetic public clip")'));
  result = {
    status: 'PASS',
    hiddenDisplayCleared: true,
    visibleRevalidated: true,
    engine: b.version,
  };
} catch (e) {
  result = { status: 'PARTIAL', message: e.message, engine: b.version };
}
writeFileSync('/tmp/maevelle-cart01b/evidence/visibility.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await b.send('Target.disposeBrowserContext', { browserContextId: c });
b.close();
