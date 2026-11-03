/** Same-origin Chromium variant selection and bounded real API performance probes. */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFileSync, writeFileSync } from 'node:fs';
import { browser, wait } from './cart-phase01b-cdp.mjs';

const fixture = JSON.parse(readFileSync('/tmp/maevelle-cart01c/fixture.json', 'utf8'));
const base = 'http://localhost:3000';
const b = await browser();
const context = (await b.send('Target.createBrowserContext')).browserContextId;
try {
  const tab = await b.tab(base + '/products/' + fixture.choiceHandle, {
    browserContextId: context,
  });
  await tab.call('Page.bringToFront');
  await tab.call('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const pick =
    '[...document.querySelectorAll("button")].find(e=>e.innerText.trim()==="Textured" || e.ariaLabel==="Textured")';
  await wait(() => tab.evaluate(`Boolean(${pick})`));
  await wait(async () => {
    await tab.evaluate(`${pick}.click()`);
    return tab.evaluate(`${pick}.getAttribute("aria-pressed")==="true"`);
  });
  await wait(() =>
    tab.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled'),
  );
  const startAdd = performance.now();
  await tab.evaluate('document.querySelector("#pdp-mobile-inline-add-to-cart").click()');
  await wait(() => tab.evaluate('document.body.innerText.includes("Added to your bag.")'));
  const addMs = performance.now() - startAdd;
  const probes = [];
  for (let batch = 0; batch < 3; batch++) {
    const measured = await tab.evaluate(`Promise.all(Array.from({length:4},async()=>{
      const start=performance.now();
      const response=await fetch('/api/storefront/v1/carts/current');
      return {status:response.status,elapsedMs:performance.now()-start,body:await response.json()};
    }))`);
    for (const result of measured) {
      assert.equal(result.status, 200);
      const lines = result.body.data.lines;
      assert.equal(lines.length, 1);
      assert.equal(lines[0].variantId, fixture.selectedVariantId);
      assert.equal(lines[0].unitPrice, '123.0000');
      probes.push(result.elapsedMs);
    }
  }
  const mutationProbes = await tab.evaluate(`(async()=>{
    const root='/api/storefront/v1/carts/current';
    let view=(await (await fetch(root)).json()).data;
    const samples=[];
    for (const quantity of ['2','1','2','1']) {
      const start=performance.now();
      const response=await fetch(root+'/lines/'+view.lines[0].id,{
        method:'PATCH',
        headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID(),'x-cart-context':view.ownerContext},
        body:JSON.stringify({quantity,version:view.version,ownerContext:view.ownerContext})
      });
      const elapsedMs=performance.now()-start;
      view=(await response.json()).data;
      if (!response.ok || Number(view.lines[0].quantity)!==Number(quantity)) throw new Error('Mutation probe failed');
      samples.push(elapsedMs);
    }
    return samples;
  })()`);
  assert.equal(mutationProbes.length, 4);
  const startCart = performance.now();
  await tab.navigate(base + '/cart');
  await wait(() => tab.evaluate('document.body.innerText.includes("Synthetic selectable clip")'));
  const cartMs = performance.now() - startCart;
  const stepper = await tab.evaluate(
    `[...document.querySelectorAll('button[aria-label="Increase quantity"],button[aria-label="Decrease quantity"]')].map(button=>{const {width,height}=button.getBoundingClientRect();return{width,height}})`,
  );
  assert.equal(stepper.length, 2);
  assert.ok(stepper.every(({ width, height }) => width >= 48 && height >= 48));
  writeFileSync(
    '/tmp/maevelle-cart01c/variant.json',
    JSON.stringify(
      {
        status: 'PASS',
        engine: b.version,
        selection: 'Textured',
        serverUnitPrice: '123.0000',
        addToConfirmationMs: addMs,
        cartNavigationToVisibleMs: cartMs,
        stepper,
        concurrentReadBatches: 3,
        parallelReads: 4,
        observedResponseHeaderMs: probes,
        observedMutationResponseHeaderMs: mutationProbes,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await b.send('Target.disposeBrowserContext', { browserContextId: context });
  b.close();
}
