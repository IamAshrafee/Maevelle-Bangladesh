'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { requestStorefrontClient } from '@/lib/api/client/http';
import {
  copyPublicLink,
  nativeShare,
  readGuestShares,
  shareError,
  shareUrl,
  writeGuestShares,
  type GuestShare,
} from '../share-client';

const MANAGE = '/api/storefront/v1/wishlist/shares/manage';
export function GuestShareHistory({
  account,
  onClaimed,
  revision = 0,
}: {
  account: boolean;
  onClaimed?: () => void;
  revision?: number;
}) {
  const [shares, setShares] = useState<GuestShare[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'revoke' | 'claim' } | null>(null);
  const [expiry, setExpiry] = useState<Record<string, number>>({});
  const expiryIntent = useRef(new Map<string, string>());
  useEffect(() => {
    setShares(readGuestShares());
  }, [revision]);
  async function manage(share: GuestShare, action: 'inspect' | 'revoke' | 'renew' | 'claim') {
    setBusy(share.id);
    setMessage('');
    try {
      if (action === 'claim') {
        await requestStorefrontClient(
          `/api/storefront/v1/wishlist/account-shares/${share.id}/claim`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ manageToken: share.manageToken }),
          },
        );
        const next = shares.filter((item) => item.id !== share.id);
        writeGuestShares(next);
        setShares(next);
        onClaimed?.();
        setMessage('Link moved to your account. Existing public links remain usable.');
      } else {
        const expiresAt =
          action === 'renew'
            ? (expiryIntent.current.get(share.id) ??
              new Date(Date.now() + (expiry[share.id] ?? 30) * 86_400_000).toISOString())
            : null;
        if (expiresAt) expiryIntent.current.set(share.id, expiresAt);
        const result = await requestStorefrontClient<{
          expiresAt: string;
          revoked: boolean;
          expired?: boolean;
        }>(MANAGE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: share.manageToken,
            action,
            ...(expiresAt ? { expiresAt } : {}),
          }),
        });
        if (action === 'renew') expiryIntent.current.delete(share.id);
        const next = shares.map((item) =>
          item.id === share.id
            ? { ...item, expiresAt: result.expiresAt, revoked: result.revoked }
            : item,
        );
        writeGuestShares(next);
        setShares(next);
        setMessage(
          action === 'revoke'
            ? 'Link revoked.'
            : action === 'renew'
              ? 'Expiration updated.'
              : 'Link status refreshed.',
        );
      }
      setConfirm(null);
    } catch (error) {
      setMessage(shareError(error));
    } finally {
      setBusy(null);
    }
  }
  function forget(share: GuestShare) {
    try {
      const next = shares.filter((item) => item.id !== share.id);
      writeGuestShares(next);
      setShares(next);
      setMessage('This browser no longer stores that obsolete link.');
    } catch { setMessage('This browser could not remove the local record.'); }
  }
  return (
    <section aria-labelledby="guest-share-history" className="mt-8 border-t border-border/50 pt-6">
      <h3 className="font-serif text-xl text-on-surface" id="guest-share-history">
        Links from this browser
      </h3>
      <p className="mt-1 text-sm text-on-surface-variant">
        Guest links can be managed only while this browser keeps their private credentials. The
        public link alone cannot restore them.
      </p>
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-on-surface">
          {message}
        </p>
      ) : null}
      {!shares.length ? (
        <p className="mt-4 text-sm text-on-surface-variant">No guest links saved here.</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {shares.map((share) => {
          const active = !share.revoked && Date.parse(share.expiresAt) > Date.now();
          return (
            <li
              className="rounded-xl border border-border bg-surface-container-lowest p-4"
              key={share.id}
            >
              <p className="font-label-md text-sm font-semibold text-on-surface">
                {share.itemCount} pieces ·{' '}
                {share.revoked ? 'Revoked' : active ? 'Active' : 'Expired'}
              </p>
              <p className="mt-1 font-mono text-xs tabular-nums text-on-surface-variant">
                Expires {new Date(share.expiresAt).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {active ? (
                  <>
                    <Button
                      onClick={() =>
                        void copyPublicLink(share.viewToken)
                          .then(() => setMessage('Link copied.'))
                          .catch(() => setMessage('Could not copy the link.'))
                      }
                      variant="outline"
                    >
                      Copy link
                    </Button>
                    <Button
                      onClick={() =>
                        void nativeShare(share.viewToken).catch((error) => {
                          if (!(error instanceof Error && error.name === 'AbortError'))
                            setMessage(shareError(error));
                        })
                      }
                      variant="outline"
                    >
                      Device share
                    </Button>
                    <a
                      className="inline-flex min-h-9 items-center px-2 text-xs text-primary underline"
                      href={`https://wa.me/?text=${encodeURIComponent(`Here are some Maevelle favorites I thought you'd love. ${shareUrl(share.viewToken)}`)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      WhatsApp
                    </a>
                  </>
                ) : null}
                {!share.revoked ? (
                  <>
                    <Button
                      disabled={busy !== null}
                      onClick={() => void manage(share, 'inspect')}
                      variant="ghost"
                    >
                      Refresh status
                    </Button>
                    {active ? (
                      <Button
                        disabled={busy !== null}
                        onClick={() => setConfirm({ id: share.id, action: 'revoke' })}
                        variant="danger"
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {account && !share.revoked ? (
                  <Button
                    disabled={busy !== null}
                    onClick={() => setConfirm({ id: share.id, action: 'claim' })}
                    variant="outline"
                  >
                    Move to my account
                  </Button>
                ) : null}
              </div>
              {active ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label
                    className="text-xs text-on-surface-variant"
                    htmlFor={`guest-expiry-${share.id}`}
                  >
                    Extend by
                  </label>
                  <Select
                    className="max-w-32"
                    id={`guest-expiry-${share.id}`}
                    onChange={(event) => {
                      expiryIntent.current.delete(share.id);
                      setExpiry((old) => ({ ...old, [share.id]: Number(event.target.value) }));
                    }}
                    value={expiry[share.id] ?? 30}
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days</option>
                    <option value={60}>60 days</option>
                    <option value={90}>90 days</option>
                  </Select>
                  <Button
                    disabled={busy !== null}
                    onClick={() => void manage(share, 'renew')}
                    variant="outline"
                  >
                    Update expiry
                  </Button>
                </div>
              ) : null}
              {share.revoked ? <Button onClick={() => forget(share)} variant="ghost">Remove local record</Button> : null}
              {confirm?.id === share.id ? (
                <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-sm">
                  <p>
                    {confirm.action === 'claim'
                      ? 'Move management of this guest link to your signed-in account? The public link stays the same.'
                      : 'Revoking prevents future opens. It does not erase what others already viewed or copied, and your private wishlist stays unchanged.'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      disabled={busy !== null}
                      onClick={() => void manage(share, confirm.action)}
                      variant={confirm.action === 'revoke' ? 'danger' : 'primary'}
                    >
                      Confirm
                    </Button>
                    <Button onClick={() => setConfirm(null)} variant="ghost">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
