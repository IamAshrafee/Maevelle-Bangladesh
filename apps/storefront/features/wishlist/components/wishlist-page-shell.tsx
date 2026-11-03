'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/classnames';
import { requestStorefrontClient } from '@/lib/api/client/http';
import { useWishlist } from '@/features/wishlist/use-wishlist';
import { emitWishlistObservation } from '@/lib/analytics/wishlist-telemetry';
import { WishlistDesktopView } from './wishlist-desktop-view';
import { WishlistMobileView } from './wishlist-mobile-view';
import { cartStore } from '@/features/cart/browser-runtime';
import { cartIssue } from '@/features/cart/errors';
import { wishlistStore } from '../wishlist-store';
import { WishlistBagDialog, type WishlistBagSelection } from './wishlist-bag-dialog';
import { WishlistBagFeedback } from './wishlist-bag-feedback';
import { WishlistSharingPanel } from './wishlist-sharing-panel';
import type { WishlistCatalogProduct, WishlistDisplayItem, WishlistSort, WishlistViewProps } from './wishlist-view-model';

export interface WishlistPageShellProps {
  className?: string;
  mode?: 'auto' | 'mobile' | 'desktop';
  inDrawer?: boolean;
  onNavigate?: () => void;
}

export function WishlistPageShell({ className, mode: viewMode = 'auto', inDrawer = false, onNavigate }: WishlistPageShellProps) {
  const { items, count, nextCursor, loadingMore, loadMore, removeItem, recentlyRemoved, undoRemove, toastMessage,
    mode, sync, syncMessage, retrySync, pendingIds, mergeReviewed, mergeConflict,
    reviewMergeConflict, confirmMergeAfterReview, ownerGeneration, ownerPartition, listVersion } = useWishlist();
  const [catalog, setCatalog] = useState<Map<string, WishlistCatalogProduct> | null>(null);
  const catalogCache = useRef(new Map<string, WishlistCatalogProduct>());
  const sharingRef = useRef<HTMLDivElement>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [sort, setSort] = useState<WishlistSort>('recent');
  const [activeCategory, setActiveCategory] = useState('all');
  const [sharingOpen, setSharingOpen] = useState(false);
  const feedbackId = useId();
  const focusBagFeedback = useRef(false);
  const [selection, setSelection] = useState<WishlistBagSelection | null>(null);
  const [bagFeedback, setBagFeedback] = useState<{ generation: number; message: string | null } | null>(null);
  const activeSelection = selection?.source.generation === ownerGeneration ? selection : null;
  const feedback = bagFeedback?.generation === ownerGeneration ? bagFeedback : null;

  function chooseForBag(item: WishlistDisplayItem, action: WishlistBagSelection['action']) {
    focusBagFeedback.current = false;
    setBagFeedback(null);
    setSelection({
      item,
      action,
      source: { generation: ownerGeneration, partition: ownerPartition, version: listVersion },
      bag: cartStore.getSnapshot().confirmed,
    });
  }

  async function submitBagSelection(variantId: string, quantity: string) {
    if (!activeSelection) return;
    const { source, item, bag, action } = activeSelection;
    focusBagFeedback.current = true;
    const latest = wishlistStore.getSnapshot();
    if (latest.ownerGeneration !== source.generation || latest.ownerPartition !== source.partition) return;
    if (
      latest.sync !== 'synced' ||
      latest.listVersion !== source.version ||
      !latest.items.some((entry) => entry.id === item.entry.id &&
        entry.savedAt === item.entry.savedAt && entry.preferredVariantId === item.entry.preferredVariantId)
    ) {
      setBagFeedback({ generation: source.generation, message: 'Your wishlist changed. Review your saved items before trying again.' });
      return;
    }
    setBagFeedback({ generation: source.generation, message: null });
    try {
      if (source.partition)
        await cartStore.transferWishlistItem({
          action, productId: item.entry.id, variantId, quantity, wishlistVersion: source.version,
        }, source.partition, bag ?? undefined);
      else if (latest.mode === 'guest')
        await cartStore.addGuestSavedItem(variantId, quantity, bag ?? undefined);
    } catch (error) {
      if (wishlistStore.getSnapshot().ownerGeneration === source.generation && !cartStore.getSnapshot().issue)
        setBagFeedback({ generation: source.generation, message: cartIssue(error, Date.now()).message });
    }
  }

  const ids = items.map((item) => item.id).join(',');
  useEffect(() => { setSharingOpen(false); }, [ownerGeneration]);

  useEffect(() => {
    if (mode !== 'guest' && mode !== 'account') return;
    void emitWishlistObservation({
      name: 'WISHLIST_PAGE_VIEWED',
      mode: mode === 'account' ? 'ACCOUNT' : 'GUEST',
    });
  }, [mode]);

  useEffect(() => {
    if (!ids) { catalogCache.current.clear(); setCatalog(new Map()); setLoadError(false); setLoadingCatalog(false); return; }
    const controller = new AbortController();
    const requested = ids.split(',');
    const visible = new Set(requested);
    for (const id of catalogCache.current.keys()) if (!visible.has(id)) catalogCache.current.delete(id);
    const missing = requested.filter((id) => !catalogCache.current.has(id));
    if (!missing.length) { setCatalog(new Map(catalogCache.current)); setLoadError(false); setLoadingCatalog(false); return; }
    setLoadingCatalog(true);
    setLoadError(false);
    const batches = missing.reduce<string[][]>((result, id, index) => {
      if (index % 100 === 0) result.push([]);
      result.at(-1)!.push(id);
      return result;
    }, []);
    Promise.all(batches.map((productIds) => requestStorefrontClient<WishlistCatalogProduct[]>('/api/storefront/v1/wishlist/products', {
      method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productIds }),
    }))).then((pages) => { if (!controller.signal.aborted) {
      for (const product of pages.flat()) catalogCache.current.set(product.id, product);
      setCatalog(new Map(catalogCache.current));
      setLoadingCatalog(false);
    } }).catch(() => { if (!controller.signal.aborted) { setLoadError(true); setLoadingCatalog(false); } });
    return () => controller.abort();
  }, [ids, retryKey]);

  const categories = useMemo(() => mode === 'guest'
    ? [...new Set(items.map((item) => catalog?.get(item.id)?.categoryName).filter((value): value is string => Boolean(value)))].sort()
    : [], [items, catalog, mode]);
  const displayItems = useMemo(() => {
    const mapped: WishlistDisplayItem[] = items.map((entry) => ({ entry, product: catalog?.get(entry.id) ?? null }));
    const filtered = mode === 'guest' && activeCategory !== 'all'
      ? mapped.filter(({ product }) => product?.categoryName === activeCategory) : mapped;
    if (mode === 'guest' && sort === 'oldest') filtered.reverse();
    if (mode === 'guest' && (sort === 'price-asc' || sort === 'price-desc')) filtered.sort((a, b) => {
      const aPrice = a.product?.price;
      const bPrice = b.product?.price;
      if (aPrice == null) return bPrice == null ? 0 : 1;
      if (bPrice == null) return -1;
      return (sort === 'price-asc' ? Number(aPrice) - Number(bPrice) : Number(bPrice) - Number(aPrice)) ||
        (b.entry.savedAt ?? '').localeCompare(a.entry.savedAt ?? '');
    });
    return filtered;
  }, [items, catalog, mode, activeCategory, sort]);
  const viewProps: WishlistViewProps = {
    count, items: displayItems, totalVisible: items.length,
    availableVisible: items.filter((item) => catalog?.get(item.id)?.available).length,
    mode: mode === 'account' ? 'account' : 'guest', sort, onSortChange: setSort,
    categories, activeCategory, onCategoryChange: setActiveCategory,
    onRemove: ({ entry, product }) => removeItem(entry.id, product ? {
      ...entry, title: product.title, handle: product.handle, price: Number(product.price ?? 0),
      inStock: product.available,
    } : entry),
    bagActions: inDrawer ? undefined : (item) => item.product?.available && (
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" size="sm" variant="tonal" aria-label={`Add ${item.product.title} to bag`}
          disabled={sync !== 'synced' || pendingIds.includes(item.entry.id)} onClick={(event) => { event.currentTarget.focus(); chooseForBag(item, 'ADD'); }}>Add to bag</Button>
        {mode === 'account' && ownerPartition && (
          <Button className="min-h-11" size="sm" variant="outline" aria-label={`Move ${item.product.title} to bag`}
            disabled={sync !== 'synced' || pendingIds.includes(item.entry.id)} onClick={(event) => { event.currentTarget.focus(); chooseForBag(item, 'MOVE'); }}>Move to bag</Button>
        )}
      </div>
    ),
    pendingIds, nextCursor, loadingMore, onLoadMore: () => void loadMore(),
    onShare: () => { setSharingOpen(true); requestAnimationFrame(() => sharingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); },
    showSharing: true, onNavigate,
  };
  return <div className={cx('relative min-h-[60vh] w-full bg-surface', className)}>
    {!inDrawer && <WishlistBagFeedback id={feedbackId} engaged={Boolean(feedback)} message={feedback?.message ?? null} onNavigate={onNavigate} />}
    {activeSelection && <WishlistBagDialog
      selection={activeSelection}
      disabled={sync !== 'synced' || listVersion !== activeSelection.source.version}
      onClose={() => {
        if (wishlistStore.getSnapshot().ownerGeneration !== activeSelection.source.generation) return;
        setSelection((current) => current === activeSelection ? null : current);
        if (focusBagFeedback.current) {
          focusBagFeedback.current = false;
          requestAnimationFrame(() => document.getElementById(feedbackId)?.focus());
        }
      }}
      onSubmit={submitBagSelection}
      fallbackFocusId={feedbackId}
    />}
    {toastMessage ? <div aria-live="polite" className="mx-auto mt-4 max-w-7xl px-4 sm:px-6"><div className="rounded-xl border border-border bg-inverse-surface px-4 py-3 font-label-md text-xs text-inverse-on-surface shadow-lg">{toastMessage} {recentlyRemoved ? <button className="ml-2 min-h-11 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={undoRemove} type="button">Undo</button> : null}</div></div> : null}
    {syncMessage ? <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6"><div className="rounded-xl border border-border bg-surface-container-lowest p-4 font-body-md text-sm text-on-surface" role={sync === 'error' || sync === 'conflicted' ? 'alert' : 'status'}>
      {syncMessage} {mergeConflict ? <Button className="ml-2" onClick={() => void reviewMergeConflict()} variant="outline">Review current wishlist</Button>
        : sync === 'error' || sync === 'conflicted' ? <Button className="ml-2" onClick={retrySync} variant="outline">Retry</Button> : null}
      {mergeReviewed ? <Button className="ml-2" onClick={() => void confirmMergeAfterReview()} variant="outline">Merge guest pieces after review</Button> : null}
    </div></div> : null}
    {mode === 'resolving' ? <div aria-label="Loading your wishlist" className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6" role="status">
      <div className="h-10 w-44 animate-pulse rounded-lg bg-surface-container-high motion-reduce:animate-none" />
      {[0, 1, 2].map((index) => <div className="h-40 animate-pulse rounded-xl bg-surface-container-high motion-reduce:animate-none" key={index} />)}
    </div> : mode === 'expired' ? <section className="mx-auto my-12 max-w-lg rounded-2xl border border-border bg-surface-container-lowest px-5 py-12 text-center" role="alert">
      <h1 className="font-headline-lg text-2xl font-semibold text-primary">Your account Wishlist is private</h1>
      <p className="mt-2 font-body-md text-on-surface-variant">Sign in again to see your saved pieces.</p>
      <Link className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-primary px-5 font-label-md font-semibold text-on-primary" href="/account" onClick={() => onNavigate?.()}>Sign in</Link>
    </section> : <>
      {loadError ? <div className="mx-auto mt-4 max-w-7xl px-4 sm:px-6"><div className="rounded-xl border border-warning/30 bg-warning-subtle p-4 font-body-md text-sm text-warning-foreground" role="alert">Current product details could not be loaded. <Button className="ml-2" onClick={() => setRetryKey((value) => value + 1)} variant="outline">Retry</Button></div></div> : null}
      {loadingCatalog || (!catalog && !loadError) ? <div aria-label="Loading current product details" className="mx-auto max-w-7xl space-y-3 px-4 py-5 sm:px-6" role="status"><p className="font-body-md text-sm text-on-surface-variant">Loading current product details…</p>{[0, 1].map((index) => <div className="h-36 animate-pulse rounded-xl bg-surface-container-high motion-reduce:animate-none" key={index} />)}</div> : null}
      {!loadingCatalog && !loadError && catalog && !(inDrawer && sharingOpen) ? <>
        <div className={viewMode === 'mobile' ? '' : viewMode === 'desktop' ? 'hidden' : 'lg:hidden'}><WishlistMobileView {...viewProps} inDrawer={inDrawer} /></div>
        <div className={viewMode === 'desktop' ? '' : viewMode === 'mobile' ? 'hidden' : 'hidden lg:block'}><WishlistDesktopView {...viewProps} /></div>
      </> : null}
      {sharingOpen && (mode === 'guest' || mode === 'account') ? <div ref={sharingRef}><WishlistSharingPanel
        items={items.filter((item) => catalog?.has(item.id)).map((item) => ({ ...item, title: catalog?.get(item.id)?.title ?? item.title }))}
        key={`${mode}:${ownerPartition ?? ownerGeneration}`} mode={mode} ownerPartition={ownerPartition}
        nextCursor={nextCursor} loadingMore={loadingMore} onLoadMore={() => void loadMore()}
        onBack={() => setSharingOpen(false)} />
      </div> : null}
    </>}
  </div>;
}
