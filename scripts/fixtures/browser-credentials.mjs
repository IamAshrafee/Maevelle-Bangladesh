import { createHash, randomBytes } from 'node:crypto';

/** Public reproducible password ONLY for disposable, loopback synthetic accounts.
 * Not a secret, signing key or provider credential. Browser and fixture share it.
 */
export const fixturePassword =
  createHash('sha256')
    .update('Maevelle public disposable browser account fixture v1')
    .digest('base64url') + '!aA1';
/** Authentication signing keys are ephemeral per fixture process, never public passwords. */
export const fixtureSigningSecret = () => randomBytes(48).toString('base64url');
