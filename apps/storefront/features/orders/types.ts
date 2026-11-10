import type { PublicOrderTrackingDto } from '@maevelle/contracts';

export interface ConsignmentItem {
  readonly id: string;
  readonly title: string;
  readonly variantDescription: string;
  readonly quantity: number;
  readonly unitPrice: number | string;
  readonly netPrice: number | string;
  readonly imageUrl?: string | null;
}

export interface ConsignmentTimelineStep {
  readonly title: string;
  readonly timestamp: string;
  readonly description: string;
  readonly status: 'completed' | 'active' | 'pending';
  readonly riderInfo?:
    | {
        readonly name: string;
        readonly phone: string;
      }
    | undefined;
}

export interface ConsignmentData {
  readonly orderNumber: string;
  readonly statusBadgeText: string;
  readonly isPulseActive: boolean;
  readonly estimatedArrivalTitle: string;
  readonly estimatedArrivalSubtitle: string;
  readonly carrierName: string;
  readonly trackingWaybill: string;
  readonly timeline: readonly ConsignmentTimelineStep[];
  readonly items: readonly ConsignmentItem[];
  readonly paymentMethodText: string;
  readonly originalPayable: number | string;
  readonly customerName?: string;
  readonly deliveryAddress?: string;
  readonly isRealBackendOrder?: boolean;
}

export const DEMO_CONSIGNMENT: ConsignmentData = {
  orderNumber: 'MB-84291',
  statusBadgeText: 'In Transit — Dhaka Express',
  isPulseActive: true,
  estimatedArrivalTitle: 'Tomorrow',
  estimatedArrivalSubtitle: 'by 6:00 PM',
  carrierName: 'Pathao Logistics',
  trackingWaybill: 'PTH-9920148',
  timeline: [
    {
      title: 'Order Placed & Confirmed',
      timestamp: 'May 24, 3:45 PM',
      description: 'Verified instant payment via bKash Merchant Gateway.',
      status: 'completed',
    },
    {
      title: 'Handcrafted & Wax Sealed',
      timestamp: 'May 24, 6:15 PM',
      description: 'Quality verified with signature berry ribbon & wax seal.',
      status: 'completed',
    },
    {
      title: 'Dispatched via Pathao Courier',
      timestamp: 'May 25, 9:30 AM',
      description: 'Out for delivery with rider Imran Hossain.',
      status: 'active',
      riderInfo: {
        name: 'Imran Hossain',
        phone: '01844-399210',
      },
    },
    {
      title: 'Doorstep Inspection & Handover',
      timestamp: 'Pending',
      description: 'Open-box inspection supported before sharing safe OTP code.',
      status: 'pending',
    },
  ],
  items: [
    {
      id: 'item-1',
      title: 'Aurelia Pearl Drop Earrings',
      variantDescription: '18K Gold Plated • Handcrafted',
      quantity: 1,
      unitPrice: 1650,
      netPrice: 1650,
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAU8kN5Vdd-XFeUvL46CjxHeMIuqVlvOhzkxBeqEZbQrpiAvJAiT-7KIfOiRtN8aHnlzi4hl7xu93DUKF1LuLzY7_QV3v_7C9HV326W7qStkQMjNbSV9416GdaPdUvNT05egHsMOPWx_l2v_-w_bwM1u73AHYoiOqof4dI9HA21x3AGn1cFuS-IR6lPC7KsnlSwjexBjU1nzxRYx9mekEi6tr1w1Gj7NRsuBBgaH2bJjAiRGixv7mxx',
    },
    {
      id: 'item-2',
      title: 'Plush Velvet Silk Hair Ribbon',
      variantDescription: 'Deep Berry • Signature Silk Edition',
      quantity: 1,
      unitPrice: 850,
      netPrice: 850,
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC57r3CLXUvSZDBeSKxpeW7zHa4TrFki3NN8CLIcNCvq3b0x3BgofZM0zdNua_l8jL5nikW5IvXlgQEapXPagGkR7P3N-42uqSvANLP4zOsySIjt0LqFD-QyzC9kv_zUS_Q1kLJx_KqQ1Vtma1HqZVoxE8BNuFF2WBZDzQWGDBYsYv26QNi8khn29i6w-Me5_-376wN8A3ehSUNcdGYyVnQWNxyLKrloWk_OQw1kcZz0XKVo9NZhIXn',
    },
  ],
  paymentMethodText: 'bKash Pre-authorized',
  originalPayable: 2370,
  customerName: 'Nusrat Jahan',
  deliveryAddress: 'Banani, Dhaka',
  isRealBackendOrder: false,
};

export function transformPublicTrackingToConsignment(
  order: PublicOrderTrackingDto,
): ConsignmentData {
  const isDelivered = order.deliveryStatus === 'DELIVERED';
  const isInTransit =
    order.deliveryStatus === 'IN_TRANSIT' || order.fulfillmentStatus === 'FULFILLED';
  const isPreparing = order.fulfillmentStatus === 'IN_PROGRESS';
  const isCancelled = order.status === 'CANCELLED';

  let statusBadgeText = 'Order Confirmed — Packaging Scheduled';
  if (isCancelled) {
    statusBadgeText = 'Order Cancelled';
  } else if (isDelivered) {
    statusBadgeText = 'Delivered — Handover Complete';
  } else if (isInTransit) {
    statusBadgeText = `In Transit — ${order.delivery?.carrierName || 'Courier not assigned'}`;
  } else if (isPreparing) {
    statusBadgeText = 'Packaging & Quality Inspection';
  }

  const carrierName = order.delivery?.carrierName || 'Courier not assigned';
  const trackingWaybill = order.delivery?.trackingReference || 'Tracking unavailable';

  let estimatedArrivalTitle = 'Delivery estimate unavailable';
  let estimatedArrivalSubtitle = 'Check the latest delivery status';
  if (order.delivery?.estimatedDeliveryAt) {
    const estDate = new Date(order.delivery.estimatedDeliveryAt);
    estimatedArrivalTitle = estDate.toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
    estimatedArrivalSubtitle = estDate.toLocaleTimeString('en-BD', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } else if (order.delivery?.deliveredAt) {
    const delDate = new Date(order.delivery.deliveredAt);
    estimatedArrivalTitle = 'Delivered On';
    estimatedArrivalSubtitle = delDate.toLocaleDateString('en-BD', {
      month: 'short',
      day: 'numeric',
    });
  }

  const items: ConsignmentItem[] = order.lines.map((line, idx) => ({
    id: `item-${idx}`,
    title: line.productTitle,
    variantDescription: line.variantTitle
      ? `${line.variantTitle} • Handcrafted`
      : 'Signature Edition',
    quantity: Number(line.quantity) || 1,
    unitPrice: line.unitPrice,
    netPrice: line.net,
    imageUrl: line.imageUrl,
  }));

  const paymentMethodText =
    order.paymentMethod === 'COD'
      ? 'Cash on Delivery'
      : order.paymentMethod === 'BKASH_MANUAL'
        ? 'bKash Manual Verification'
        : order.paymentMethod === 'NAGAD_MANUAL'
          ? 'Nagad Manual Verification'
          : `${order.paymentMethod} Pre-authorized`;

  const orderDateStr = new Date(order.createdAt).toLocaleDateString('en-BD', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const timeline: ConsignmentTimelineStep[] = [
    {
      title: 'Order recorded',
      timestamp: orderDateStr,
      description: 'Payment and delivery statuses are tracked separately.',
      status: 'completed',
    },
    {
      title: 'Order status',
      timestamp: 'Current status',
      description: order.status,
      status: isCancelled ? 'completed' : 'active',
    },
    ...(order.delivery?.deliveredAt
      ? [
          {
            title: 'Delivered',
            timestamp: new Date(order.delivery.deliveredAt).toLocaleString('en-BD'),
            description: 'Recorded delivery completion.',
            status: 'completed' as const,
          },
        ]
      : []),
  ];

  const destParts = [
    order.destination.area,
    order.destination.city,
    order.destination.district,
  ].filter(Boolean);
  const deliveryAddress = destParts.join(', ') || 'Dhaka, Bangladesh';

  return {
    orderNumber: order.orderNumber,
    statusBadgeText,
    isPulseActive: isInTransit || isPreparing,
    estimatedArrivalTitle,
    estimatedArrivalSubtitle,
    carrierName,
    trackingWaybill,
    timeline,
    items,
    paymentMethodText,
    originalPayable: order.total,
    deliveryAddress,
    isRealBackendOrder: true,
  };
}
