'use client';

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ProductCard } from '@/components/commerce/product-card';
import { publicMediaPath } from '@/lib/media/url';
import { requestStorefrontClient } from '@/lib/api/client/http';
import { Button } from '@/components/ui/button';
import type { WishlistPublicShareDto, WishlistSharedProductDto } from '@maevelle/contracts';
import { useWishlist } from '../use-wishlist';
import { wishlistStore } from '../wishlist-store';
import { recipientNoPendingFeedback } from '../recipient-save-feedback';
import { emitWishlistObservation } from '@/lib/analytics/wishlist-telemetry';

type Product = WishlistSharedProductDto;

const subscribeToFragment = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};
const readFragment = () => window.location.hash.slice(1);
const serverFragment = () => '';

export function SharedWishlist() {
  const token = useSyncExternalStore(subscribeToFragment, readFragment, serverFragment);
  // A new capability owns a new UI lifecycle, including pending recipient feedback.
  return <SharedWishlistCollection key={token} token={token} />;
}

function SharedWishlistCollection({ token }: { readonly token: string }) {
  const [products, setProducts] = useState<readonly Product[] | null>(null);
  const [unavailableCount, setUnavailableCount] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
  const [savingOne, setSavingOne] = useState<{ id: string; title: string; owner: number } | null>(
    null,
  );
  const [state, setState] = useState<'loading' | 'unavailable' | 'error' | 'ready'>('loading');
  const [message, setMessage] = useState('');
  const { addItem, isInWishlist, ownerGeneration, mode, sync, pendingIds } = useWishlist();
  useEffect(() => {
    if (!savingOne) return;
    if (savingOne.owner !== ownerGeneration) {
      setSavingOne(null);
      return;
    }
    if (sync === 'error' || sync === 'conflicted') {
      setMessage(
        `Account save for “${savingOne.title}” needs review. Open your wishlist and retry.`,
      );
      setSavingOne(null);
      return;
    }
    if (pendingIds.includes(savingOne.id)) return;
    setMessage(
      isInWishlist(savingOne.id)
        ? `Saved “${savingOne.title}” to your account.`
        : `Could not save “${savingOne.title}”. Review your wishlist and retry.`,
    );
    setSavingOne(null);
  }, [savingOne, ownerGeneration, pendingIds, isInWishlist, sync]);
  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      setState('unavailable');
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const share = await requestStorefrontClient<WishlistPublicShareDto>(
          '/api/storefront/v1/wishlist/shares/open',
          {
            method: 'POST',
            signal: controller.signal,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token }),
          },
        );
        if (controller.signal.aborted) return;
        setProducts(share.products);
        setUnavailableCount(share.unavailableCount);
        setState('ready');
      } catch (error) {
        if (controller.signal.aborted) return;
        setState(
          error instanceof Error && 'status' in error && error.status === 404
            ? 'unavailable'
            : 'error',
        );
      }
    })();
    return () => controller.abort();
  }, [retryKey, token]);
  useEffect(() => {
    if (state !== 'ready' || (mode !== 'guest' && mode !== 'account')) return;
    void emitWishlistObservation({
      name: 'WISHLIST_RECIPIENT_VIEWED',
      mode: mode === 'account' ? 'ACCOUNT' : 'GUEST',
    });
  }, [state, mode]);
  function save(product: Product) {
    void emitWishlistObservation({
      name: 'WISHLIST_SAVE_ONE_INITIATED',
      mode: mode === 'account' ? 'ACCOUNT' : 'GUEST',
    });
    const saved = addItem(
      {
        id: product.id,
        handle: product.handle,
        title: product.title,
        subtitle: product.description ?? '',
        category: 'all',
        categoryLabel: 'Saved product',
        price: Number(product.price ?? 0),
        imageUrl: product.primaryMediaAssetId
          ? publicMediaPath(product.primaryMediaAssetId, 'card')
          : '',
        alt: product.title,
        inStock: product.available,
      },
      product.preferredVariantId,
    );
    if (saved) {
      if (mode === 'account')
        setSavingOne({ id: product.id, title: product.title, owner: ownerGeneration });
      setMessage(
        mode === 'account'
          ? `Saving “${product.title}” to your account…`
          : `Saved “${product.title}” in this browser.`,
      );
    } else setMessage(`Could not save “${product.title}”. Try again.`);
  }
  async function saveAll() {
    if (savingAll) return;
    void emitWishlistObservation({
      name: 'WISHLIST_SAVE_ALL_INITIATED',
      mode: mode === 'account' ? 'ACCOUNT' : 'GUEST',
    });
    const startingOwner = ownerGeneration;
    setSavingAll(true);
    let queued = 0;
    let existing = 0;
    let failed = 0;
    for (const product of products ?? []) {
      if (startingOwner !== wishlistStore.getSnapshot().ownerGeneration) break;
      if (isInWishlist(product.id)) {
        existing++;
        continue;
      }
      const saved = addItem(
        {
          id: product.id,
          handle: product.handle,
          title: product.title,
          subtitle: product.description ?? '',
          category: 'all',
          categoryLabel: 'Saved product',
          price: Number(product.price ?? 0),
          imageUrl: product.primaryMediaAssetId
            ? publicMediaPath(product.primaryMediaAssetId, 'card')
            : '',
          alt: product.title,
          inStock: product.available,
        },
        product.preferredVariantId,
      );
      if (saved) queued++;
      else failed++;
      // The account controller serializes writes. Yield so large collections do not block interaction.
      if (queued % 10 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    if (startingOwner === wishlistStore.getSnapshot().ownerGeneration) {
      if (mode === 'account' && queued) {
        setMessage(
          `${queued} submitted for account saving, ${existing} already saved, ${failed} could not be submitted. Waiting for confirmation…`,
        );
        await new Promise<void>((resolve) => {
          let finished = false;
          let timer = 0;
          let stop = () => {};
          const finish = () => {
            if (finished) return;
            finished = true;
            window.clearTimeout(timer);
            stop();
            resolve();
          };
          const check = () => {
            const snapshot = wishlistStore.getSnapshot();
            if (
              snapshot.ownerGeneration !== startingOwner ||
              snapshot.pendingIds.length === 0 ||
              snapshot.sync === 'conflicted' ||
              snapshot.sync === 'error'
            )
              finish();
          };
          stop = wishlistStore.subscribe(check);
          if (finished) stop();
          else timer = window.setTimeout(finish, 30_000);
          check();
        });
        if (startingOwner === wishlistStore.getSnapshot().ownerGeneration) {
          const snapshot = wishlistStore.getSnapshot();
          const confirmed = (products ?? []).filter(
            (product) => wishlistStore.membership(product.id) === true,
          ).length;
          setMessage(
            snapshot.pendingIds.length ||
              snapshot.sync === 'conflicted' ||
              snapshot.sync === 'error'
              ? `${confirmed} currently saved, ${failed} could not be submitted. Some account saves are still unresolved; use Wishlist Retry after reviewing the current list.`
              : `${confirmed} saved to your account, ${failed} could not be submitted.`,
          );
        }
      } else
        setMessage(
          recipientNoPendingFeedback(
            mode === 'account' ? 'account' : 'guest',
            queued,
            existing,
            failed,
          ),
        );
    }
    setSavingAll(false);
  }
  return (
    <main className="mx-auto min-h-[60vh] max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-semibold text-primary">A Collection of Favorites</h1>
      <p className="mt-2 text-on-surface-variant">Someone shared these Maevelle finds with you.</p>
      {state === 'loading' ? (
        <p role="status" className="mt-8 text-on-surface-variant">
          Loading collection…
        </p>
      ) : null}
      {state === 'unavailable' ? (
        <div className="mt-8 rounded-xl border border-border p-6">
          <p className="text-on-surface">This wishlist is no longer available.</p>
          <Link className="mt-4 inline-block text-primary underline" href="/categories">
            Explore Maevelle
          </Link>
        </div>
      ) : null}
      {state === 'error' ? (
        <div role="alert" className="mt-8 rounded-xl border border-border p-6 text-on-surface">
          The collection could not be loaded.{' '}
          <Button
            className="mt-3"
            onClick={() => {
              setState('loading');
              setRetryKey((value) => value + 1);
            }}
            variant="outline"
          >
            Try again
          </Button>
        </div>
      ) : null}
      {state === 'ready' ? (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="font-mono text-sm tabular-nums text-on-surface-variant">
              {products?.length ?? 0} public products
              {unavailableCount ? ` · ${unavailableCount} no longer shown` : ''}
            </p>
            {products?.length ? (
              <Button
                disabled={savingAll || mode === 'resolving' || mode === 'expired'}
                onClick={() => void saveAll()}
              >
                Save all to my wishlist
              </Button>
            ) : null}
          </div>
          {!products?.length ? (
            <div className="mt-8 rounded-xl border border-border bg-surface-container-lowest p-6">
              <h2 className="font-serif text-xl">
                This collection has no pieces available to view now
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                The link is valid, but its products are no longer in the public catalog.
              </p>
              <Link className="mt-4 inline-block text-primary underline" href="/categories">
                Explore Maevelle
              </Link>
            </div>
          ) : null}
          {mode === 'account' && (sync === 'pending' || pendingIds.length) ? (
            <p role="status" className="mt-3 text-sm text-on-surface-variant">
              Your account saves are still syncing.
            </p>
          ) : null}
          {message ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-lg border border-border p-3 text-sm text-on-surface"
            >
              {message}
            </p>
          ) : null}
          <div className="mt-6 grid gap-x-4 gap-y-8 grid-cols-2 lg:grid-cols-3">
            {products?.map((product) => (
              <div
                className="min-w-0"
                key={product.id}
                onClickCapture={() => {
                  void emitWishlistObservation({
                    name: 'WISHLIST_PRODUCT_OPENED',
                    mode: mode === 'account' ? 'ACCOUNT' : 'GUEST',
                  });
                }}
              >
                <ProductCard
                  badge={product.available ? undefined : 'Out of stock'}
                  badgeType="neutral"
                  href={`/products/${product.handle}`}
                  id={product.id}
                  imageUrl={
                    product.primaryMediaAssetId
                      ? publicMediaPath(product.primaryMediaAssetId, 'card')
                      : ''
                  }
                  price={product.price}
                  showWishlist={false}
                  title={product.title}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg bg-surface-container-low px-3 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    href={`/products/${product.handle}`}
                  >
                    {product.available ? 'Shop this piece' : 'View piece'}
                  </Link>
                  <Button
                    className="min-h-10"
                    disabled={isInWishlist(product.id)}
                    onClick={() => save(product)}
                    variant="outline"
                  >
                    {isInWishlist(product.id) ? 'Saved' : 'Save to wishlist'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}
