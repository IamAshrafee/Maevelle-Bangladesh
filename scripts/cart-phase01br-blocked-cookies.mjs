/** Chrome profile Preferences must actually block first-party cookies; verifies blockedReasons. */
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { browser, wait, delay } from './cart-phase01b-cdp.mjs';
const f = JSON.parse(readFileSync('/tmp/maevelle-cart01br/fixture.json', 'utf8'));
const b = await browser(9228),
  blocked = [];
b.listen((e) => {
  if (e.method === 'Network.responseReceivedExtraInfo')
    for (const c of e.params.blockedCookies ?? []) blocked.push(...c.blockedReasons);
});
const t = await b.tab('http://localhost:3000/products/' + f.code);
await b.send('Target.activateTarget', { targetId: t.id });
await wait(() => t.evaluate('!document.querySelector("#pdp-mobile-inline-add-to-cart").disabled'));
await delay(200);
await t.evaluate('document.querySelector("#pdp-mobile-inline-add-to-cart").click()');
let result;
try {
  await wait(() =>
    t.evaluate('document.body.innerText.includes("did not return the bag session cookie")'),
  );
  const cookies = (await b.send('Storage.getCookies')).cookies.filter((c) =>
    c.name.includes('maevelle_cart'),
  );
  assert.equal(cookies.length, 0);
  assert.ok(blocked.includes('UserPreferences'));
  assert.equal(await t.evaluate('document.body.innerText.includes("Added to your bag.")'), false);
  result = {
    status: 'PASS',
    engine: b.version,
    blockedReasons: [...new Set(blocked)],
    cookieCount: 0,
    noFalseSuccess: true,
  };
} catch (e) {
  result = { status: 'FAIL', message: e.message, blockedReasons: [...new Set(blocked)] };
}
writeFileSync(
  'docs/architecture/cart/phase01br-evidence/blocked-cookies.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
b.close();
if (result.status !== 'PASS') process.exitCode = 1;
