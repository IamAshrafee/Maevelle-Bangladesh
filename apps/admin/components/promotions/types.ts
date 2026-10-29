export type PromotionType = 'AUTOMATIC' | 'COUPON';
export type PromotionStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type BenefitType = 'PERCENTAGE_DISCOUNT' | 'FIXED_AMOUNT_DISCOUNT';
export type Combinability = 'EXCLUSIVE' | 'STACKABLE';

export interface CouponItem {
  readonly id: string;
  readonly code: string;
  readonly status: string;
  readonly usageLimitTotal?: number | null;
  readonly usageLimitPerCustomer?: number | null;
  readonly usageCount?: number;
  readonly createdAt?: string;
}

export interface PromotionItem {
  readonly id: string;
  readonly name: string;
  readonly promotionType: PromotionType;
  readonly status: PromotionStatus;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly priority: number;
  readonly combinability: Combinability;
  readonly benefitType: BenefitType;
  readonly benefitValue: string;
  readonly minimumMerchandiseSubtotal: string | null;
  readonly coupons: readonly CouponItem[];
  readonly committedUsageCount: number;
  readonly committedDiscount: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly targetProductCount?: number;
  readonly targetCategoryCount?: number;
  readonly targetVariantCount?: number;
}

export interface PromotionUsageItem {
  readonly id: string;
  readonly orderId: string | null;
  readonly orderNumber: string | null;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly customerNumber: string | null;
  readonly couponCode: string | null;
  readonly discountAmount: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface PromotionDetail extends PromotionItem {
  readonly revisionId: string | null;
  readonly revisionNumber: number;
  readonly targetProducts: readonly { id: string; title: string; handle: string }[];
  readonly targetCategories: readonly { id: string; name: string; handle: string }[];
  readonly recentUsages: readonly PromotionUsageItem[];
}

export interface CatalogCategoryChoice {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
}

export interface CatalogProductChoice {
  readonly id: string;
  readonly title: string;
  readonly handle: string;
}

