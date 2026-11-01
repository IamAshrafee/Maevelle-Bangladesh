export type WishlistCategory = 'all' | 'jewelry' | 'hair' | 'bags' | 'wraps';

export interface WishlistItem {
  readonly preferredVariantId?: string | null;
  readonly preferredVariantAvailable?: boolean;
  readonly savedAt?: string;
  readonly alt: string;
  readonly badge?: string;
  readonly badgeType?: 'scarcity' | 'primary-fixed' | 'secondary-fixed' | 'surface-container-high' | 'primary-fixed-dim';
  readonly category: WishlistCategory;
  readonly categoryLabel: string;
  readonly deliveryTag?: string;
  readonly discountTag?: string;
  readonly handle: string;
  readonly id: string;
  readonly imageUrl: string;
  readonly inStock: boolean;
  readonly originalPrice?: number;
  readonly price: number;
  readonly subtitle: string;
  readonly title: string;
}

export const FREE_DELIVERY_THRESHOLD = 9000;
