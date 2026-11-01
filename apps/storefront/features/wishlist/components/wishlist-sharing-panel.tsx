'use client';

import { useEffect, useRef, useState } from 'react';
import type { WishlistShareCreatedDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox, Radio } from '@/components/ui/selection-control';
import { Select } from '@/components/ui/select';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';
import type { WishlistItem } from '../types';
import {
  accountPendingKey,
  buildShareRequest,
  copyPublicLink,
  createAccountShare,
  expiresIn,
  GUEST_PENDING_KEY,
  nativeShare,
  operationId,
  readGuestShares,
  shareError,
  shareUrl,
  writeGuestShares,
  type GuestShare,
  type PendingShare,
} from '../share-client';
import { AccountShareHistory } from './account-share-history';
import { GuestShareHistory } from './guest-share-history';

export function WishlistSharingPanel({
  items,
  mode,
  ownerPartition,
  onBack,
  nextCursor,
  loadingMore,
  onLoadMore,
}: {
  items: readonly WishlistItem[];
  mode: 'guest' | 'account';
  ownerPartition: string | null;
  onBack?: () => void;
  nextCursor?: string | null;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [selection, setSelection] = useState<'all' | 'selected'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [days, setDays] = useState(30);
  const [pending, setPending] = useState<PendingShare | null>(null);
  const [result, setResult] = useState<WishlistShareCreatedDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const epoch = useRef(0);
  const shareAllControl = useRef<HTMLInputElement>(null);
  const selectedDetails = useRef(
    new Map<string, { productId: string; preferredVariantId: string | null }>(),
  );
  const owner = mode === 'account' ? ownerPartition : 'guest';
  useEffect(() => {
    epoch.current++;
    selectedDetails.current.clear();
    setSelected([]);
    setSelection('all');
    setResult(null);
    setMessage('');
    setDays(30);
    try {
      const key =
        mode === 'guest'
          ? GUEST_PENDING_KEY
          : ownerPartition
            ? accountPendingKey(ownerPartition)
            : null;
      const stored = key
        ? (JSON.parse((mode === 'guest' ? localStorage : sessionStorage).getItem(key) ?? 'null') as
            PendingShare | { operationId: string; expiresAt: string; selection: string } | null)
        : null;
      if (stored && 'request' in stored && stored.owner === owner) {
        for (const item of stored.request.items)
          selectedDetails.current.set(item.productId, {
            productId: item.productId,
            preferredVariantId: item.preferredVariantId ?? null,
          });
        setPending(stored);
        setSelection(stored.request.selection);
        setSelected(stored.request.items.map((item) => item.productId));
        setMessage(
          'An earlier share request may have completed. Retry it with the same operation to recover the result.',
        );
      } else if (stored && 'operationId' in stored && mode === 'guest') {
        // Existing Phase 04 pending guest payload remains recoverable.
        const ids = stored.selection.split(',').filter(Boolean);
        const restored: PendingShare = {
          owner: 'guest',
          request: {
            operationId: stored.operationId,
            expiresAt: stored.expiresAt,
            selection: 'selected',
            items: ids.map((productId) => ({ productId })),
          },
        };
        for (const item of restored.request.items)
          selectedDetails.current.set(item.productId, {
            productId: item.productId,
            preferredVariantId: null,
          });
        setPending(restored);
        setSelection('selected');
        setSelected(ids);
        setMessage('An earlier guest link may already exist. Retry to recover it safely.');
      } else setPending(null);
    } catch {
      setPending(null);
      setMessage('Browser storage is unavailable. Link creation needs storage to recover safely.');
    }
    return () => {
      epoch.current++;
    };
  }, [mode, owner, ownerPartition]);
  const key =
    mode === 'guest'
      ? GUEST_PENDING_KEY
      : ownerPartition
        ? accountPendingKey(ownerPartition)
        : null;
  const storage = mode === 'guest' ? 'local' : 'session';
  function clearPending() {
    if (key)
      try {
        (storage === 'local' ? localStorage : sessionStorage).removeItem(key);
      } catch {
        /* In-memory state still clears. */
      }
    setPending(null);
  }
  function changeIntent(nextSelection: 'all' | 'selected', ids = selected, nextDays = days) {
    if (pending) {
      setMessage(
        'A previous creation is unresolved. Retry it or review links before starting a new collection.',
      );
      return;
    }
    setSelection(nextSelection);
    setSelected(ids);
    setDays(nextDays);
    setResult(null);
    for (const item of items)
      if (ids.includes(item.id))
        selectedDetails.current.set(item.id, {
          productId: item.id,
          preferredVariantId: item.preferredVariantId ?? null,
        });
    for (const id of selectedDetails.current.keys())
      if (!ids.includes(id)) selectedDetails.current.delete(id);
  }
  async function create() {
    if (!owner || busy) return;
    const chosen = selected;
    if (selection === 'selected' && !chosen.length && !pending) {
      setMessage('Select at least one saved piece.');
      return;
    }
    if (mode === 'guest' && selection === 'all' && !items.length && !pending) {
      setMessage('Save a piece before sharing.');
      return;
    }
    const current = epoch.current;
    setBusy(true);
    setMessage('');
    let intent = pending;
    try {
      if (!intent) {
        const request = buildShareRequest({
          mode,
          selection,
          items,
          selected: chosen.map((id) => selectedDetails.current.get(id)!).filter(Boolean),
          operationId: operationId(),
          expiresAt: expiresIn(days),
        });
        if (request.items.length > 100) {
          setMessage('A link can hold up to 100 pieces. Choose fewer pieces.');
          return;
        }
        intent = { owner, request };
        if (!key) throw new Error('Account session is not ready. Try again.');
        (storage === 'local' ? localStorage : sessionStorage).setItem(key, JSON.stringify(intent));
        setPending(intent);
      }
      const created =
        mode === 'account'
          ? await createAccountShare(intent.request)
          : await requestStorefrontClient<GuestShare>('/api/storefront/v1/wishlist/shares', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                operationId: intent.request.operationId,
                expiresAt: intent.request.expiresAt,
                items: intent.request.items,
              }),
            });
      if (current !== epoch.current) return;
      if (mode === 'guest') {
        const guest = created as GuestShare;
        try {
          writeGuestShares([guest, ...readGuestShares().filter((item) => item.id !== guest.id)]);
        } catch {
          try {
            await requestStorefrontClient('/api/storefront/v1/wishlist/shares/manage', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ token: guest.manageToken, action: 'revoke' }),
            });
          } catch {
            setMessage(
              'This browser could not keep the private management credential and revocation could not be confirmed. Do not send this link; retry this operation to recover it.',
            );
            return;
          }
          setMessage(
            'Browser storage failed, so the new link was revoked. Free space or enable storage, then create another.',
          );
          clearPending();
          return;
        }
      }
      setResult(created);
      clearPending();
      setRevision((value) => value + 1);
      setMessage(
        `Collection created with ${created.itemCount} ${created.itemCount === 1 ? 'piece' : 'pieces'}. This is a fixed selection; later wishlist changes stay private.`,
      );
    } catch (error) {
      if (current === epoch.current) {
        if (error instanceof StorefrontClientApiError && [400, 422].includes(error.status)) {
          clearPending();
          if (mode === 'account' && selection === 'all' && error.message.includes('100'))
            setSelection('selected');
        }
        setMessage(shareError(error));
      }
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  }
  return (
    <section
      aria-labelledby="wishlist-sharing-title"
      className="mx-auto w-full max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:pt-8"
    >
      <div className="rounded-2xl border border-border/50 bg-surface-container-lowest p-5 shadow-xs sm:p-7">
        {onBack ? (
          <Button autoFocus className="mb-4" onClick={onBack} variant="ghost">
            ← Back to wishlist
          </Button>
        ) : null}
        <h2 className="font-serif text-2xl font-semibold text-primary" id="wishlist-sharing-title">
          Share your favorites
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
          Create a collection from your saved pieces. Anyone with its link can view it until it
          expires or you revoke it. Later changes to your private wishlist stay private.
        </p>
        {result ? (
          <div
            className="mt-6 rounded-xl border border-primary/30 bg-primary-subtle p-4"
            role="status"
          >
            <h3 className="font-serif text-xl text-on-surface">Your collection is ready</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              {result.itemCount} pieces · Expires {new Date(result.expiresAt).toLocaleString()}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                autoFocus
                onClick={() =>
                  void copyPublicLink(result.viewToken)
                    .then(() => setMessage('Link copied.'))
                    .catch(() => setMessage('Could not copy the link. Try device sharing.'))
                }
              >
                Copy link
              </Button>
              <Button
                onClick={() =>
                  void nativeShare(result.viewToken).catch((error) => {
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
                href={`https://wa.me/?text=${encodeURIComponent(`Here are some Maevelle favorites I thought you'd love. ${shareUrl(result.viewToken)}`)}`}
                rel="noreferrer"
                target="_blank"
              >
                WhatsApp
              </a>
              <Button
                onClick={() => {
                  setResult(null);
                  setMessage('');
                  window.requestAnimationFrame(() => shareAllControl.current?.focus());
                }}
                variant="ghost"
              >
                Create another
              </Button>
              <Button
                onClick={() =>
                  document
                    .getElementById(
                      mode === 'account' ? 'account-share-history' : 'guest-share-history',
                    )
                    ?.scrollIntoView({
                      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'auto'
                        : 'smooth',
                      block: 'start',
                    })
                }
                variant="ghost"
              >
                Manage link
              </Button>
            </div>
          </div>
        ) : (
          <>
            <fieldset className="mt-6">
              <legend className="font-label-md text-sm font-semibold text-on-surface">
                What would you like to share?
              </legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border p-2">
                  <Radio
                    checked={selection === 'all'}
                    disabled={!!pending}
                    label={`All eligible saved pieces${mode === 'account' ? ' (entire account)' : ''}`}
                    name="share-scope"
                    onChange={() => changeIntent('all')}
                    ref={shareAllControl}
                  />
                </div>
                <div className="rounded-xl border border-border p-2">
                  <Radio
                    checked={selection === 'selected'}
                    disabled={!!pending}
                    label="Only pieces I choose"
                    name="share-scope"
                    onChange={() => changeIntent('selected')}
                  />
                </div>
              </div>
            </fieldset>
            {selection === 'selected' ? (
              <fieldset className="mt-5">
                <legend className="text-sm font-semibold">
                  Select saved pieces ·{' '}
                  <span className="font-mono tabular-nums">{selected.length}</span> selected
                </legend>
                <p className="mt-1 text-xs text-on-surface-variant">
                  More saved pieces can be selected after loading them on your wishlist. This choice
                  does not change your private saves.
                </p>
                <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                  {items.map((item) => (
                    <div className="rounded-lg border border-border p-2" key={item.id}>
                      <Checkbox
                        checked={selected.includes(item.id)}
                        disabled={!!pending}
                        label={item.title}
                        onChange={() =>
                          changeIntent(
                            'selected',
                            selected.includes(item.id)
                              ? selected.filter((id) => id !== item.id)
                              : [...selected, item.id],
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                {nextCursor ? (
                  <Button
                    className="mt-3"
                    disabled={loadingMore}
                    onClick={onLoadMore}
                    variant="outline"
                  >
                    {loadingMore ? 'Loading more pieces…' : 'Load more saved pieces to select'}
                  </Button>
                ) : null}
              </fieldset>
            ) : (
              <p className="mt-4 text-xs text-on-surface-variant">
                {mode === 'account'
                  ? 'The server selects your full eligible account wishlist, including pieces not loaded on this page. A link holds at most 100 pieces.'
                  : `${items.length} saved pieces will be sent. A link holds at most 100 pieces.`}
              </p>
            )}
            <div className="mt-5">
              <label className="text-sm font-semibold" htmlFor="share-expiry">
                Link expires after
              </label>
              <Select
                className="ml-3 max-w-40"
                disabled={!!pending}
                id="share-expiry"
                onChange={(event) => changeIntent(selection, selected, Number(event.target.value))}
                value={days}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </Select>
              <p className="mt-1 text-xs text-on-surface-variant">
                The server confirms the final expiration time.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                disabled={
                  busy ||
                  (!pending &&
                    (selection === 'selected'
                      ? selected.length === 0
                      : mode === 'guest' && !items.length))
                }
                loading={busy}
                onClick={() => void create()}
              >
                {pending ? 'Retry earlier creation' : 'Create collection link'}
              </Button>
              {pending ? (
                <Button
                  onClick={() => {
                    clearPending();
                    setMessage('Review your links before creating a new collection.');
                  }}
                  variant="outline"
                >
                  Start a new collection
                </Button>
              ) : null}
            </div>
          </>
        )}
        {message ? (
          <p aria-live="polite" className="mt-4 text-sm text-on-surface">
            {message}
          </p>
        ) : null}
        {mode === 'account' && ownerPartition ? (
          <AccountShareHistory owner={ownerPartition} revision={revision} />
        ) : null}
        <GuestShareHistory
          account={mode === 'account'}
          onClaimed={() => setRevision((value) => value + 1)}
          revision={revision}
        />
      </div>
    </section>
  );
}
