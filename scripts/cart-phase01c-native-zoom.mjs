/** Uses Chrome's own Settings on disposable profiles and verifies layout at native page zoom. */
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { browser, wait } from './cart-phase01b-cdp.mjs';

const fixture = JSON.parse(readFileSync('/tmp/maevelle-cart01c/fixture.json', 'utf8'));
const base = 'http://localhost:3000';
const results = [];
for (const [port, ratio] of [
  [9230, 2],
  [9231, 4],
]) {
  const b = await browser(port);
  const settings = await b.tab('chrome://settings/appearance');
  const select = `(() => {
    const find = (root) => root.querySelector('#zoomLevel') ||
      [...root.querySelectorAll('*')].map(e=>e.shadowRoot).filter(Boolean).map(find).find(Boolean);
    return find(document);
  })()`;
  await wait(() => settings.evaluate(`Boolean(${select}?.options?.length)`));
  assert.equal(
    await settings.evaluate(`(() => {
    const control = ${select};
    const option = [...control.options].find(o=>o.textContent.trim()==='${ratio * 100}%');
    if (!option) return false;
    control.value = option.value;
    control.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    return true;
  })()`),
    true,
  );
  const tab = await b.tab(base + '/products/' + fixture.code);
  try {
    const bounds = () =>
      tab.evaluate(`({
      viewport:innerWidth, outer:outerWidth, scroll:document.documentElement.scrollWidth,
      dpr:devicePixelRatio, cssZoom:getComputedStyle(document.body).zoom,
    })`);
    await wait(async () => Math.abs((await bounds()).dpr - ratio) < 0.02);
    const pdp = await bounds();
    assert.ok(Math.abs(pdp.viewport * ratio - pdp.outer) <= 8);
    assert.equal(pdp.cssZoom, '1');
    await wait(() =>
      tab.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled'),
    );
    await tab.evaluate('document.querySelector("#pdp-mobile-inline-add-to-cart").click()');
    await wait(() => tab.evaluate('document.body.innerText.includes("Added to your bag.")'));
    await tab.navigate(base + '/cart');
    await wait(() => tab.evaluate('document.body.innerText.includes("Synthetic public clip")'));
    await tab.evaluate(
      '[...document.querySelectorAll("button")].find(e=>e.innerText==="No thanks")?.click()',
    );
    const cart = await bounds();
    await tab.evaluate(
      '(()=>{const trigger=[...document.querySelectorAll("button")].find(e=>e.innerText==="Clear bag");trigger.focus();trigger.click()})()',
    );
    await wait(() => tab.evaluate('!!document.querySelector("dialog[open]")'));
    const dialog = await tab.evaluate(`(() => {
      const box = document.querySelector("dialog[open]").getBoundingClientRect();
      return { left: box.left, right: box.right, width: innerWidth, initialFocus: document.activeElement.innerText };
    })()`);
    const shot = await tab.call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
    });
    writeFileSync(
      `/tmp/maevelle-cart01c/native-zoom-${ratio}.png`,
      Buffer.from(shot.data, 'base64'),
    );
    async function press(key, windowsVirtualKeyCode) {
      for (const type of ['keyDown', 'keyUp']) {
        await tab.call('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode });
      }
    }
    await tab.call('Page.bringToFront');
    await press('Tab', 9);
    const confirm = await tab.evaluate(`(() => {
      const active = document.activeElement;
      const box = active.getBoundingClientRect();
      const dialogBox = document.querySelector('dialog[open]').getBoundingClientRect();
      return { label:active.innerText, keyboardVisible:active.matches(':focus-visible'),
        verticallyVisible:box.top >= dialogBox.top - 1 && box.bottom <= dialogBox.bottom + 1 };
    })()`);
    assert.deepEqual(confirm, {
      label: 'Clear items and coupons',
      keyboardVisible: true,
      verticallyVisible: true,
    });
    await press('Escape', 27);
    await wait(() =>
      tab.evaluate(
        '!document.querySelector("dialog[open]") && document.activeElement.innerText==="Clear bag"',
      ),
    );
    const pass =
      pdp.scroll <= pdp.viewport + 1 &&
      cart.scroll <= cart.viewport + 1 &&
      dialog.left >= -1 &&
      dialog.right <= dialog.width + 1 &&
      dialog.initialFocus === 'Cancel';
    results.push({
      engine: b.version,
      percent: ratio * 100,
      pdp,
      cart,
      dialog,
      confirm,
      focusRestored: true,
      status: pass ? 'PASS' : 'FAIL',
    });
  } finally {
    await tab.close();
    await settings.close();
    b.close();
  }
}
writeFileSync('/tmp/maevelle-cart01c/native-zoom.json', JSON.stringify(results, null, 2) + '\n');
if (results.some((r) => r.status !== 'PASS')) process.exitCode = 1;
