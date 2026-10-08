import type { PublicOrderTrackingDto } from '@maevelle/contracts';

export interface ConsignmentItem {
  readonly id: string;
  readonly title: string;
  readonly variantDescription: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly netPrice: number;
  readonly imageUrl?: string | null;
}

export interface ConsignmentTimelineStep {
  readonly title: string;
  readonly timestamp: string;
  readonly description: string;
  readonly status: 'completed' | 'active' | 'pending';
  readonly riderInfo?: {
    readonly name: string;
    readonly phone: string;
  } | undefined;
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
  readonly totalSettled: number;
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
      description: 'Quality passed at Banani Atelier with signature berry ribbon & wax seal.',
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
      variantDescription: 'Deep Berry • Atelier Silk Edition',
      quantity: 1,
      unitPrice: 850,
      netPrice: 850,
      imageUrl:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuC57r3CLXUvSZDBeSKxpeW7zHa4TrFki3NN8CLIcNCvq3b0x3BgofZM0zdNua_l8jL5nikW5IvXlgQEapXPagGkR7P3N-42uqSvANLP4zOsySIjt0LqFD-QyzC9kv_zUS_Q1kLJx_KqQ1Vtma1HqZVoxE8BNuFF2WBZDzQWGDBYsYv26QNi8khn29i6w-Me5_-376wN8A3ehSUNcdGYyVnQWNxyLKrloWk_OQw1kcZz0XKVo9NZhIXn',
    },
  ],
  paymentMethodText: 'bKash Pre-authorized',
  totalSettled: 2370,
  customerName: 'Nusrat Jahan',
  deliveryAddress: 'Banani, Dhaka',
  isRealBackendOrder: false,
};

export function transformPublicTrackingToConsignment(order: PublicOrderTrackingDto): ConsignmentData {
  const isDelivered = order.deliveryStatus === 'DELIVERED';
  const isInTransit = order.deliveryStatus === 'IN_TRANSIT' || order.fulfillmentStatus === 'FULFILLED';
  const isPreparing = order.fulfillmentStatus === 'IN_PROGRESS';
  const isCancelled = order.status === 'CANCELLED';

  let statusBadgeText = 'Order Confirmed — Atelier Scheduled';
  if (isCancelled) {
    statusBadgeText = 'Order Cancelled';
  } else if (isDelivered) {
    statusBadgeText = 'Delivered — Handover Complete';
  } else if (isInTransit) {
    statusBadgeText = `In Transit — ${order.delivery?.carrierName || 'Dhaka Express'}`;
  } else if (isPreparing) {
    statusBadgeText = 'Atelier Packaging & Inspection';
  }

  const carrierName = order.delivery?.carrierName || 'Pathao Logistics';
  const trackingWaybill = order.delivery?.trackingReference || `MV-${order.orderNumber.replace(/[^a-zA-Z0-9]/g, '')}`;

  let estimatedArrivalTitle = 'Tomorrow';
  let estimatedArrivalSubtitle = 'by 6:00 PM';
  if (order.delivery?.estimatedDeliveryAt) {
    const estDate = new Date(order.delivery.estimatedDeliveryAt);
    estimatedArrivalTitle = estDate.toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
    estimatedArrivalSubtitle = estDate.toLocaleTimeString('en-BD', { hour: 'numeric', minute: '2-digit' });
  } else if (order.delivery?.deliveredAt) {
    const delDate = new Date(order.delivery.deliveredAt);
    estimatedArrivalTitle = 'Delivered On';
    estimatedArrivalSubtitle = delDate.toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
  }

  const items: ConsignmentItem[] = order.lines.map((line, idx) => ({
    id: `item-${idx}`,
    title: line.productTitle,
    variantDescription: line.variantTitle ? `${line.variantTitle} • Handcrafted` : 'Atelier Edition',
    quantity: Number(line.quantity) || 1,
    unitPrice: Number(line.unitPrice) || 0,
    netPrice: Number(line.net) || 0,
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
      title: 'Order Placed & Confirmed',
      timestamp: orderDateStr,
      description:
        order.paymentMethod === 'COD'
          ? 'Cash on delivery verified for dispatch.'
          : `Verified payment via ${order.paymentMethod}.`,
      status: 'completed',
    },
    {
      title: 'Handcrafted & Wax Sealed',
      timestamp: isPreparing || isInTransit || isDelivered ? 'Quality Approved' : 'In Preparation',
      description: 'Quality passed at Banani Atelier with signature berry ribbon & wax seal.',
      status: isPreparing ? 'active' : isInTransit || isDelivered ? 'completed' : 'pending',
    },
    {
      title: `Dispatched via ${carrierName}`,
      timestamp: isInTransit || isDelivered ? 'Dispatched' : 'Pending Handover',
      description: isInTransit
        ? 'Consignment picked up and en route with assigned delivery courier.'
        : isDelivered
        ? 'Courier transit completed.'
        : 'Awaiting courier collection at Banani Hub.',
      status: isDelivered ? 'completed' : isInTransit ? 'active' : 'pending',
      riderInfo: isInTransit
        ? {
            name: 'Assigned Courier Partner',
            phone: '01844-399210',
          }
        : undefined,
    },
    {
      title: 'Doorstep Inspection & Handover',
      timestamp: isDelivered ? 'Delivered' : 'Pending',
      description: isDelivered
        ? 'Parcel handed over after successful open-box inspection.'
        : 'Open-box inspection supported before sharing safe OTP code.',
      status: isDelivered ? 'completed' : 'pending',
    },
  ];

  const destParts = [order.destination.area, order.destination.city, order.destination.district].filter(Boolean);
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
    totalSettled: Number(order.total) || 0,
    deliveryAddress,
    isRealBackendOrder: true,
  };
}
