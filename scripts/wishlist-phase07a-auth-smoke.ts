/** Real loopback authentication/email acceptance. Synthetic disposable identities only. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertPhase07aTarget, phase07aFixturePassword } from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const base = 'http://127.0.0.1:3002';
const origin = 'http://wishlist-07a.localhost:3000';
const email = `runtime-${randomUUID()}@example.test`;
const password = phase07aFixturePassword;
const post = (path: string, body: unknown, cookie = '') =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
    redirect: 'manual',
  });
const inboxUrl = () => {
  const messages = readFileSync('/tmp/maevelle-phase07a/mailbox.jsonl', 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { to: string; text: string });
  const message = messages.filter((row) => row.to === email).at(-1)!;
  return new URL(message.text.match(/https?:\/\/\S+/)![0]);
};
const statuses: Record<string, number> = {};
statuses.registration = (
  await post('/shopper-auth/sign-up/email', {
    email,
    name: 'Synthetic runtime acceptance',
    password,
    callbackURL: `${origin}/account`,
  })
).status;
statuses.unverifiedLogin = (await post('/shopper-auth/sign-in/email', { email, password })).status;
const verification = inboxUrl();
statuses.verification = (
  await fetch(`${base}${verification.pathname}${verification.search}`, { redirect: 'manual' })
).status;
statuses.repeatedVerification = (
  await fetch(`${base}${verification.pathname}${verification.search}`, { redirect: 'manual' })
).status;
const login = await post('/shopper-auth/sign-in/email', { email, password });
statuses.login = login.status;
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
statuses.privateWishlist = (
  await fetch(`${base}/storefront/v1/wishlist`, { headers: { cookie } })
).status;
statuses.resetRequest = (
  await post('/shopper-auth/request-password-reset', {
    email,
    redirectTo: `${origin}/account?view=reset`,
  })
).status;
const reset = inboxUrl();
const token = reset.pathname.split('/').at(-1)!;
const replacement = `${password}-reset`;
statuses.passwordReset = (
  await post('/shopper-auth/reset-password', { token, newPassword: replacement })
).status;
statuses.repeatedReset = (
  await post('/shopper-auth/reset-password', { token, newPassword: replacement })
).status;
statuses.oldSession = (
  await fetch(`${base}/storefront/v1/wishlist`, { headers: { cookie } })
).status;
statuses.oldPassword = (await post('/shopper-auth/sign-in/email', { email, password })).status;
const newLogin = await post('/shopper-auth/sign-in/email', { email, password: replacement });
statuses.newPassword = newLogin.status;
const newCookie = newLogin.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
statuses.signOut = (await post('/shopper-auth/sign-out', {}, newCookie)).status;
statuses.signedOutWishlist = (
  await fetch(`${base}/storefront/v1/wishlist`, { headers: { cookie: newCookie } })
).status;
writeFileSync('/tmp/maevelle-phase07a/auth-runtime.json', JSON.stringify(statuses, null, 2));
console.log(JSON.stringify(statuses, null, 2));
const expected = {
  registration: 200,
  unverifiedLogin: 403,
  verification: 302,
  repeatedVerification: 302,
  login: 200,
  privateWishlist: 200,
  resetRequest: 200,
  passwordReset: 200,
  repeatedReset: 400,
  oldSession: 401,
  oldPassword: 401,
  newPassword: 200,
  signOut: 200,
  signedOutWishlist: 401,
};
for (const [key, status] of Object.entries(expected))
  if (statuses[key] !== status) throw new Error(`${key}: expected ${status}, got ${statuses[key]}`);
