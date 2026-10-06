'use client';

import { cx } from '@/components/ui/classnames';
import { CheckCircleIcon } from '@/components/ui/icons';
import { WishlistDesktopView } from '@/features/wishlist/components/wishlist-desktop-view';
import { WishlistMobileView } from '@/features/wishlist/components/wishlist-mobile-view';
import { useWishlist } from '@/features/wishlist/use-wishlist';

export interface WishlistPageShellProps {
  className?: string | undefined;
  /** Force view mode: 'auto' (responsive), 'mobile', or 'desktop' */
  mode?: 'auto' | 'mobile' | 'desktop' | undefined;
}

export function WishlistPageShell({ className, mode = 'auto' }: WishlistPageShellProps) {
  const {
    activeCategory,
    amountNeededForFreeDelivery,
    categoryCounts,
    clearWishlist,
    deliveryProgress,
    filteredItems,
    isTransferringAll,
    items,
    moveAllToBag,
    movedItemIds,
    moveToBag,
    movingItemIds,
    removeItem,
    setActiveCategory,
    showToast,
    toastMessage,
    totalPrice,
  } = useWishlist();

  const handleShare = () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      navigator
        .share({
          title: 'My Maevelle Wishlist',
          text: 'Take a look at the curated accessories I saved at Maevelle Dhaka',
          url: window.location.href,
        })
        .catch(() => {
          // User cancelled or unsupported
        });
    } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(window.location.href);
      showToast('Wishlist link copied to clipboard');
    } else {
      showToast('Wishlist link: ' + window.location.href);
    }
  };

  return (
    <div className={cx('relative min-h-[calc(100vh-8rem)] w-full', className)}>
      {/* Responsive View Presentation */}
      {mode === 'mobile' ? (
        <WishlistMobileView
          activeCategory={activeCategory}
          amountNeededForFreeDelivery={amountNeededForFreeDelivery}
          categoryCounts={categoryCounts}
          deliveryProgress={deliveryProgress}
          filteredItems={filteredItems}
          isTransferringAll={isTransferringAll}
          items={items}
          moveAllToBag={moveAllToBag}
          movedItemIds={movedItemIds}
          moveToBag={moveToBag}
          movingItemIds={movingItemIds}
          onCategoryChange={setActiveCategory}
          onClearWishlist={clearWishlist}
          onRemoveItem={removeItem}
          onShare={handleShare}
          totalPrice={totalPrice}
        />
      ) : mode === 'desktop' ? (
        <WishlistDesktopView
          activeCategory={activeCategory}
          amountNeededForFreeDelivery={amountNeededForFreeDelivery}
          categoryCounts={categoryCounts}
          deliveryProgress={deliveryProgress}
          filteredItems={filteredItems}
          isTransferringAll={isTransferringAll}
          items={items}
          moveAllToBag={moveAllToBag}
          movedItemIds={movedItemIds}
          moveToBag={moveToBag}
          movingItemIds={movingItemIds}
          onCategoryChange={setActiveCategory}
          onClearWishlist={clearWishlist}
          onRemoveItem={removeItem}
          onShare={handleShare}
          totalPrice={totalPrice}
        />
      ) : (
        <>
          {/* Mobile & Tablet (< lg) */}
          <div className="block lg:hidden">
            <WishlistMobileView
              activeCategory={activeCategory}
              amountNeededForFreeDelivery={amountNeededForFreeDelivery}
              categoryCounts={categoryCounts}
              deliveryProgress={deliveryProgress}
              filteredItems={filteredItems}
              isTransferringAll={isTransferringAll}
              items={items}
              moveAllToBag={moveAllToBag}
              movedItemIds={movedItemIds}
              moveToBag={moveToBag}
              movingItemIds={movingItemIds}
              onCategoryChange={setActiveCategory}
              onClearWishlist={clearWishlist}
              onRemoveItem={removeItem}
              onShare={handleShare}
              totalPrice={totalPrice}
            />
          </div>

          {/* Desktop & Larger Screens (lg+) */}
          <div className="hidden lg:block">
            <WishlistDesktopView
              activeCategory={activeCategory}
              amountNeededForFreeDelivery={amountNeededForFreeDelivery}
              categoryCounts={categoryCounts}
              deliveryProgress={deliveryProgress}
              filteredItems={filteredItems}
              isTransferringAll={isTransferringAll}
              items={items}
              moveAllToBag={moveAllToBag}
              movedItemIds={movedItemIds}
              moveToBag={moveToBag}
              movingItemIds={movingItemIds}
              onCategoryChange={setActiveCategory}
              onClearWishlist={clearWishlist}
              onRemoveItem={removeItem}
              onShare={handleShare}
              totalPrice={totalPrice}
            />
          </div>
        </>
      )}

      {/* Floating Animated Toast Notification */}
      {toastMessage ? (
        <aside
          aria-live="polite"
          className="fixed bottom-24 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 z-50 pointer-events-none flex items-center justify-center"
        >
          <div className="px-4 py-2.5 rounded-full bg-inverse-surface text-inverse-on-surface font-label-md text-xs shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <CheckCircleIcon className="text-secondary-container" size={16} />
            <span>{toastMessage}</span>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
