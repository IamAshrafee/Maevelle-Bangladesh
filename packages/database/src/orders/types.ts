import type { CartView } from '../cart.js';
import type { PaymentMethodCode, PaymentSummary } from '../payments.js';

export const checkoutLifetimeMs = 60 * 60 * 1000;
export const decimalPattern = /^\d+(\.\d{1,4})?$/;

export class OrderDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'CHECKOUT_CHANGED'
      | 'CHECKOUT_COMPLETED'
      | 'CHECKOUT_EXPIRED'
      | 'OUT_OF_STOCK'
      | 'IDEMPOTENCY_CONFLICT'
      | 'STALE_VERSION'
      | 'INVALID_TRANSITION',
    message: string,
    public readonly checkout?: CheckoutView,
  ) {
    super(message);
    this.name = 'OrderDomainError';
  }
}

export interface CheckoutContactInput {
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
}

export interface CheckoutAddressInput {
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly geographyNodeId?: string;
  readonly area?: string;
  readonly city?: string;
  readonly district?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
}

export interface CheckoutView {
  readonly id: string;
  readonly version: number;
  readonly status: 'ACTIVE' | 'CHANGED' | 'ORDER_PLACED' | 'EXPIRED';
  readonly expiresAt: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly calculationVersion: number;
  readonly calculationFingerprint: string;
  readonly deliveryAmount: string;
  readonly total: string;
  readonly cart: CartView;
  readonly contact: CheckoutContactInput | null;
  readonly address: CheckoutAddressInput | null;
  readonly orderNumber?: string;
}

export interface OrderView {
  readonly id: string;
  readonly version: number;
  readonly orderNumber: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  readonly source: 'STOREFRONT' | 'MANUAL';
  readonly salesChannel:
    | 'STOREFRONT'
    | 'ADMIN'
    | 'FACEBOOK'
    | 'INSTAGRAM'
    | 'WHATSAPP'
    | 'PHONE'
    | 'EXTERNAL_API'
    | 'IMPORT';
  readonly currency: string;
  readonly total: string;
  readonly createdAt: string;
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly customerEmail?: string | null;
  readonly customerId?: string | null;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: string;
  readonly payment: PaymentSummary;
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
  readonly deliveryAmount: string;
  readonly taxAmount: string;
  readonly customer: { displayName: string; phone: string; email: string | null };
  readonly address: CheckoutAddressInput;
  readonly lines: readonly {
    id: string;
    variantId: string | null;
    sku: string;
    productTitle: string;
    variantTitle: string | null;
    imageUrl?: string | null;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    net: string;
    status: 'ACTIVE' | 'CANCELLED';
    cancellationReasonCode: string | null;
    cancellationReasonText: string | null;
    cancelledAt: string | null;
    options: readonly { name: string; value: string }[];
  }[];
}

export interface DeliveryQuote {
  readonly ruleId: string | null;
  readonly ruleName: string;
  readonly amount: string;
  readonly currency: string;
}

export type PlaceOrderResult =
  | { readonly kind: 'PLACED'; readonly order: OrderView }
  | { readonly kind: 'CHANGED'; readonly checkout: CheckoutView };

export interface AdminOrderDetailView extends OrderView {
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly deliveryAmount: string;
  readonly notes: readonly {
    id: string;
    authorActorId: string;
    noteType: string;
    body: string;
    createdAt: string;
  }[];
  readonly timeline: readonly {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }[];
  readonly fulfillments: readonly {
    id: string;
    fulfillmentNumber: string;
    status: string;
    locationId: string;
    dispatchedAt: string | null;
  }[];
  readonly deliveries: readonly {
    id: string;
    deliveryNumber: string;
    status: string;
    outcomeStatus: string | null;
    trackingNumber: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
  }[];
  readonly returnCases: readonly {
    id: string;
    caseNumber: string;
    status: string;
    returnType: string;
    createdAt: string;
  }[];
  readonly refunds: readonly {
    id: string;
    amount: string;
    status: string;
    createdAt: string;
  }[];
  readonly discountApplications: readonly {
    promotionName: string;
    couponCode: string | null;
    benefitType: string;
    benefitValue: string;
    discountAmount: string;
  }[];
  readonly cancellation: {
    reasonCode: string;
    reasonText: string | null;
    createdAt: string;
    refundSettlement: 'NOT_REQUIRED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
    refundObligations: readonly {
      id: string;
      amount: string;
      status: string;
    }[];
  } | null;
}

export interface OrderListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: OrderView['status'];
  readonly paymentStatus?: OrderPaymentStatus;
  readonly fulfillmentStatus?: OrderFulfillmentStatus;
  readonly deliveryStatus?: OrderDeliveryStatus;
  readonly paymentMethod?: PaymentMethodCode;
  readonly salesChannel?: OrderView['salesChannel'];
  readonly source?: OrderView['source'];
  /** Searched against historical order number, customer name, phone, and email snapshots. */
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
  /** When provided, also resolves MERGED alias customers to include their orders. */
  readonly customerId?: string;
}

export type OrderPaymentStatus =
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED';

export type OrderFulfillmentStatus =
  | 'UNFULFILLED'
  | 'PARTIALLY_FULFILLED'
  | 'IN_PROGRESS'
  | 'FULFILLED'
  | 'CANCELLED';

export type OrderDeliveryStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: string;
  readonly salesChannel: OrderView['salesChannel'];
  readonly status: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: OrderPaymentStatus;
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly total: string;
  readonly deliveryAmount: string;
  readonly currency: string;
  readonly customerName: string;
  readonly customerId: string | null;
  readonly customerPhone: string;
  readonly customerEmail: string | null;
  readonly createdAt: string;
}

export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export interface ManualOrderLine {
  readonly variantId: string;
  readonly quantity: string;
  readonly unitPrice?: string;
  readonly priceOverrideReason?: string;
}

export interface ManualOrderDeliveryAddress {
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly geographyNodeId?: string;
  readonly area?: string;
  readonly city?: string;
  readonly district?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
  readonly saveToCustomer?: boolean;
}

export interface CreateManualOrderInput {
  readonly organizationId: string;
  readonly actorId: string;
  readonly customerId: string;
  readonly locationId: string;
  readonly lines: readonly ManualOrderLine[];
  readonly deliveryAddress: ManualOrderDeliveryAddress;
  readonly deliveryAmount?: string;
  readonly deliveryOverrideReason?: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly salesChannel?: Exclude<OrderView['salesChannel'], 'STOREFRONT'>;
  readonly currency?: string;
  readonly idempotencyKey: string;
}

export interface PublicOrderTrackingView {
  readonly orderNumber: string;
  readonly status: OrderView['status'];
  readonly paymentStatus: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly delivery?: {
    readonly carrierName: string | null;
    readonly trackingReference: string | null;
    readonly estimatedDeliveryAt: string | null;
    readonly deliveredAt: string | null;
  } | null;
  readonly destination: {
    readonly city: string | null;
    readonly area: string | null;
    readonly district: string | null;
    readonly countryCode: string;
  };
  readonly lines: readonly {
    readonly productTitle: string;
    readonly variantTitle: string | null;
    readonly sku: string;
    readonly quantity: string;
    readonly imageUrl: string | null;
    readonly unitPrice: string;
    readonly net: string;
    readonly options: readonly { readonly name: string; readonly value: string }[];
  }[];
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly deliveryAmount: string;
  readonly total: string;
  readonly currency: string;
  readonly createdAt: string;
}

export function decimal6Minor(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

export function decimal4Minor(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

export function decimal4Text(value: bigint): string {
  const whole = value / 10_000n;
  const fraction = (value % 10_000n).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

export function multiplyDecimal4(left: string, right: string): string {
  const scaledProduct = decimal4Minor(left) * decimal4Minor(right);
  return decimal4Text((scaledProduct + 5_000n) / 10_000n);
}
