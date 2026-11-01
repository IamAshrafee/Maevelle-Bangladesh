'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WishlistShareMetadataDto, WishlistSharePageDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';
import { copyPublicLink, nativeShare, shareError, shareUrl } from '../share-client';

const BASE = '/api/storefront/v1/wishlist/account-shares';
type LinkResult = { viewToken: string };
export function AccountShareHistory({ owner, revision = 0 }: { owner: string; revision?: number }) {
  const [items, setItems] = useState<WishlistShareMetadataDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<{ id: string; action: 'revoke' | 'rotate' } | null>(null);
  const [expiry, setExpiry] = useState<Record<string, number>>({});
  const [links, setLinks] = useState<Record<string, string>>({});
  const epoch = useRef(0);
  const expiryIntent = useRef(new Map<string, string>());
  const load = useCallback(async (cursor?: string) => {
    const current = epoch.current;
    setBusy('load');
    try {
      const query = new URLSearchParams({ limit: '20' });
      if (cursor) query.set('cursor', cursor);
      const page = await requestStorefrontClient<WishlistSharePageDto>(`${BASE}?${query}`);
      if (current !== epoch.current) return;
      setItems((previous) =>
        cursor
          ? [
              ...previous,
              ...page.items.filter((item) => !previous.some((old) => old.id === item.id)),
            ]
          : [...page.items],
      );
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (current === epoch.current) setMessage(shareError(error));
    } finally {
      if (current === epoch.current) setBusy(null);
    }
  }, []);
  useEffect(() => {
    epoch.current++;
    setItems([]);
    setLinks({});
    setNextCursor(null);
    setConfirm(null);
    setMessage('');
    expiryIntent.current.clear();
    void load();
    return () => {
      epoch.current++;
    };
  }, [owner, revision, load]);
  async function act(
    item: WishlistShareMetadataDto,
    action: 'link' | 'expiry' | 'revoke' | 'rotate',
  ) {
    const current = epoch.current;
    setBusy(item.id);
    setMessage('');
    try {
      const path = `${BASE}/${item.id}`;
      if (action === 'link') {
        const result = await requestStorefrontClient<LinkResult>(`${path}/link`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        if (current === epoch.current) setLinks((old) => ({ ...old, [item.id]: result.viewToken }));
      } else if (action === 'rotate') {
        try {
          const result = await requestStorefrontClient<LinkResult>(`${path}/rotate-link`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expectedVersion: item.version }),
          });
          if (current === epoch.current)
            setLinks((old) => ({ ...old, [item.id]: result.viewToken }));
        } catch (error) {
          // A lost response may mean rotation succeeded. Reconcile before offering another attempt.
          if (current === epoch.current) {
            await load();
            try {
              const recovered = await requestStorefrontClient<LinkResult>(`${path}/link`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: '{}',
              });
              if (current === epoch.current) {
                setLinks((old) => ({ ...old, [item.id]: recovered.viewToken }));
                setMessage('Current link recovered. Earlier links may have stopped working.');
              }
            } catch {
              if (current === epoch.current)
                setMessage(
                  `The result could not be confirmed. Review this link before rotating again. ${shareError(error)}`,
                );
            }
          }
          return;
        }
      } else if (action === 'expiry') {
        const days = expiry[item.id] ?? 30;
        const expiresAt =
          expiryIntent.current.get(item.id) ??
          new Date(Date.now() + days * 86_400_000).toISOString();
        expiryIntent.current.set(item.id, expiresAt);
        await requestStorefrontClient(`${path}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expiresAt }),
        });
        expiryIntent.current.delete(item.id);
      } else
        await requestStorefrontClient(path, {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
      if (current !== epoch.current) return;
      if (action === 'revoke')
        setLinks((old) => {
          const next = { ...old };
          delete next[item.id];
          return next;
        });
      setConfirm(null);
      setMessage(
        action === 'link'
          ? 'Link ready to copy.'
          : action === 'rotate'
            ? 'New link ready. The previous link has stopped working.'
            : action === 'expiry'
              ? 'Expiration updated.'
              : 'Link revoked.',
      );
      if (action !== 'link') await load();
    } catch (error) {
      if (current === epoch.current)
        setMessage(
          action === 'link' && error instanceof StorefrontClientApiError && error.status === 409
            ? 'This older link cannot be recovered. You can explicitly replace it, but earlier copies will stop working.'
            : shareError(error),
        );
    } finally {
      if (current === epoch.current) setBusy(null);
    }
  }
  return (
    <section
      aria-labelledby="account-share-history"
      className="mt-8 border-t border-border/50 pt-6"
    >
      <h3 className="font-serif text-xl text-on-surface" id="account-share-history">
        Your account links
      </h3>
      <p className="mt-1 text-sm text-on-surface-variant">
        These collections stay separate from later changes to your private wishlist.
      </p>
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-on-surface">
          {message}
        </p>
      ) : null}
      {busy === 'load' && !items.length ? (
        <p role="status" className="mt-4 text-sm">
          Loading links…
        </p>
      ) : null}
      {!items.length && busy !== 'load' ? (
        <p className="mt-4 text-sm text-on-surface-variant">No account links yet.</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((item) => {
          const status = item.revoked
            ? 'Revoked'
            : item.expired || new Date(item.expiresAt).getTime() <= Date.now()
              ? 'Expired'
              : 'Active';
          const token = links[item.id];
          return (
            <li
              className="rounded-xl border border-border bg-surface-container-lowest p-4"
              key={item.id}
            >
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-label-md text-sm font-semibold text-on-surface">
                  {item.itemCount ?? 'Shared'} pieces · {status}
                </p>
                <time
                  className="font-mono text-xs tabular-nums text-on-surface-variant"
                  dateTime={item.expiresAt}
                >
                  Expires {new Date(item.expiresAt).toLocaleString()}
                </time>
              </div>
              {item.createdAt ? (
                <p className="mt-1 text-xs text-on-surface-variant">
                  Created {new Date(item.createdAt).toLocaleDateString()}
                </p>
              ) : null}
              {status === 'Active' ? (
                <>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {token ? (
                      <>
                        <Button
                          onClick={() =>
                            void copyPublicLink(token)
                              .then(() => setMessage('Link copied.'))
                              .catch(() => setMessage('Could not copy. Try device sharing.'))
                          }
                          variant="outline"
                        >
                          Copy link
                        </Button>
                        <Button
                          onClick={() =>
                            void nativeShare(token).catch((error) => {
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
                          href={`https://wa.me/?text=${encodeURIComponent(`Here are some Maevelle favorites I thought you'd love. ${shareUrl(token)}`)}`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          WhatsApp
                        </a>
                      </>
                    ) : (
                      <Button
                        disabled={busy !== null}
                        onClick={() => void act(item, 'link')}
                        variant="outline"
                      >
                        Get link
                      </Button>
                    )}
                    <Button
                      disabled={busy !== null}
                      onClick={() => setConfirm({ id: item.id, action: 'rotate' })}
                      variant="ghost"
                    >
                      Replace link
                    </Button>
                    <Button
                      disabled={busy !== null}
                      onClick={() => setConfirm({ id: item.id, action: 'revoke' })}
                      variant="danger"
                    >
                      Revoke
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label
                      className="text-xs text-on-surface-variant"
                      htmlFor={`expiry-${item.id}`}
                    >
                      Extend by
                    </label>
                    <Select
                      className="max-w-32"
                      id={`expiry-${item.id}`}
                      onChange={(event) => {
                        expiryIntent.current.delete(item.id);
                        setExpiry((old) => ({ ...old, [item.id]: Number(event.target.value) }));
                      }}
                      value={expiry[item.id] ?? 30}
                    >
                      <option value={7}>7 days</option>
                      <option value={30}>30 days</option>
                      <option value={60}>60 days</option>
                      <option value={90}>90 days</option>
                    </Select>
                    <Button
                      disabled={busy !== null}
                      onClick={() => void act(item, 'expiry')}
                      variant="outline"
                    >
                      Update expiry
                    </Button>
                  </div>
                </>
              ) : null}
              {confirm?.id === item.id ? (
                <div className="mt-3 rounded-lg bg-surface-container-low p-3 text-sm">
                  <p>
                    {confirm.action === 'rotate'
                      ? 'Creating a new link will make the previous link stop working. Anyone using the old link will no longer be able to open this collection.'
                      : 'Revoking prevents future opens. It does not erase what others already viewed or copied, and your private wishlist stays unchanged.'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      disabled={busy !== null}
                      onClick={() => void act(item, confirm.action)}
                      variant={confirm.action === 'revoke' ? 'danger' : 'primary'}
                    >
                      Confirm {confirm.action === 'rotate' ? 'new link' : 'revocation'}
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
      {nextCursor ? (
        <Button
          className="mt-4"
          disabled={busy !== null}
          onClick={() => void load(nextCursor)}
          variant="outline"
        >
          Load more links
        </Button>
      ) : null}
      {message && !items.length ? (
        <Button className="mt-3" onClick={() => void load()} variant="outline">
          Retry loading
        </Button>
      ) : null}
    </section>
  );
}
