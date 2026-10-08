'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  CalendarIcon,
  CardGiftcardIcon,
  CelebrationIcon,
  ChatCheckIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  HomeIcon,
  MapPinIcon,
  PackageCheckIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ShoppingBagIcon,
  SparklesIcon,
  StorefrontIcon,
  SupportAgentIcon,
  TruckIcon,
  VerifiedIcon,
} from '@/components/ui/icons';
import type { UseCheckoutReturn } from '../use-checkout';

export interface ConfirmedOrderItem {
  readonly id: string;
  readonly productTitle: string;
  readonly variantDescription: string;
  readonly quantity: number;
  readonly net: number;
  readonly imageUrl: string;
  readonly imageAlt: string;
}

export interface ConfirmedOrderData {
  readonly orderId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly recipientName?: string | undefined;
  readonly streetAddress: string;
  readonly district: string;
  readonly zoneLabel?: string | undefined;
  readonly items: readonly ConfirmedOrderItem[];
  readonly subtotal: number;
  readonly discount: number;
  readonly shippingFee: number;
  readonly total: number;
  readonly formattedTotal: string;
  readonly paymentMethodName: string;
  readonly paymentSub: string;
  readonly isPaid: boolean;
  readonly paymentColor?: string | undefined;
  readonly paymentInitials?: string | undefined;
  readonly voucherCode?: string | undefined;
}

export interface CheckoutConfirmedStepProps {
  readonly checkout?: UseCheckoutReturn | undefined;
  readonly orderData?: ConfirmedOrderData | undefined;
}

export function CheckoutConfirmedStep({ checkout, orderData }: CheckoutConfirmedStepProps) {
  const router = useRouter();

  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Derived values from either orderData or checkout
  const orderId = orderData?.orderId ?? checkout?.placedOrderSummary?.orderId ?? 'MB-84291';
  const customerName =
    orderData?.customerName ??
    (checkout?.placedOrderSummary?.customerName &&
    checkout.placedOrderSummary.customerName !== 'Valued Guest'
      ? checkout.placedOrderSummary.customerName
      : checkout?.contact.fullName || 'Nusrat Jahan');

  const rawPhone = orderData?.phone ?? checkout?.contact.phone ?? '1712345678';
  const cleanPhone = rawPhone.replace(/\D/g, '') || '1712345678';
  const formattedPhone = cleanPhone.startsWith('0')
    ? cleanPhone
    : `+880 ${cleanPhone.slice(0, 4)}-${cleanPhone.slice(4)}`;

  const isDhaka = orderData
    ? orderData.zoneLabel?.toLowerCase().includes('dhaka') ?? true
    : checkout?.address.zone === 'dhaka';
  const deliveryModeLabel =
    orderData?.zoneLabel ?? (isDhaka ? 'Dhaka Express' : 'Nationwide Courier');

  const recipientName =
    orderData?.recipientName ??
    checkout?.address.recipientName ??
    customerName;
  const streetAddress =
    orderData?.streetAddress ??
    checkout?.address.streetAddress ??
    'House 42, Road 7/A, Apt 4B';
  const district =
    orderData?.district ??
    checkout?.address.district ??
    'Dhanmondi, Dhaka';

  const items = orderData?.items ?? checkout?.items ?? [];
  const subtotal = orderData?.subtotal ?? checkout?.subtotal ?? 2500;
  const discount = orderData?.discount ?? checkout?.discount ?? 200;
  const shippingFee = orderData?.shippingFee ?? checkout?.shippingFee ?? 70;
  const formattedTotal =
    orderData?.formattedTotal ?? checkout?.formattedTotal ?? '৳2,370';
  const voucherCode = orderData?.voucherCode ?? checkout?.voucher?.code ?? 'MAEVELLEFIRST';

  // Dynamic estimated handover date calculation
  const now = new Date();
  const etaStart = new Date(now);
  etaStart.setDate(now.getDate() + (isDhaka ? 1 : 2));
  const etaEnd = new Date(now);
  etaEnd.setDate(now.getDate() + (isDhaka ? 2 : 4));

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

  const etaLabel = `${formatDate(etaStart)} – ${formatDate(etaEnd)}`;

  // Payment branding & verification status
  const paymentBadge = (() => {
    if (orderData) {
      const isPending = !orderData.isPaid && orderData.paymentMethodName.toLowerCase().includes('manual');
      return {
        name: orderData.paymentMethodName,
        sub: orderData.paymentSub,
        initials: orderData.paymentInitials ?? 'MV',
        color: orderData.paymentColor ?? '#9E2A4B',
        isPaid: orderData.isPaid,
        isPending,
        statusLabel: orderData.isPaid
          ? 'Paid'
          : isPending
          ? 'Verification Pending'
          : 'Due on Delivery',
      };
    }
    const paymentMethod = checkout?.paymentMethod ?? 'bkash';
    const selectedWallet = checkout?.selectedWallet ?? 'bkash';
    const placedOrderSummary = checkout?.placedOrderSummary;

    if (paymentMethod === 'cod') {
      return {
        name: 'Cash on Delivery',
        sub: 'Payable upon doorstep unboxing & inspection',
        initials: 'COD',
        color: '#9E2A4B',
        isPaid: false,
        isPending: false,
        statusLabel: 'Due on Delivery',
      };
    }

    const senderDisplay = placedOrderSummary?.senderPhone || checkout?.contact.phone || '01XXXXXXXXX';
    const trxDisplay = placedOrderSummary?.transactionId || '9JK84M2P';

    if (selectedWallet === 'nagad' || paymentMethod === 'nagad') {
      return {
        name: 'Nagad Manual Payment',
        sub: `TrxID: ${trxDisplay} • Sender: +880 ${senderDisplay}`,
        initials: 'N',
        color: '#F7931E',
        isPaid: false,
        isPending: true,
        statusLabel: 'Verification Pending',
      };
    }

    return {
      name: 'bKash Manual Payment',
      sub: `TrxID: ${trxDisplay} • Sender: +880 ${senderDisplay}`,
      initials: 'bK',
      color: '#E2136E',
      isPaid: false,
      isPending: true,
      statusLabel: 'Verification Pending',
    };
  })();

  const handleCopyOrderId = async () => {
    try {
      await navigator.clipboard.writeText(orderId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const handleDownloadInvoice = () => {
    setIsDownloading(true);
    setTimeout(() => {
      setIsDownloading(false);
      window.print();
    }, 400);
  };

  /* -------------------------------------------------------------
     RENDER SUB-SECTIONS (Reusable across Mobile and Desktop)
  -------------------------------------------------------------- */

  // 1. Hero Celebration Section
  const renderHero = (isDesktop: boolean) => {
    if (isDesktop) {
      return (
        <section className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-8 lg:p-10 shadow-sm border border-border-subtle">
          <div className="absolute -top-16 -right-16 size-56 rounded-full bg-secondary-fixed opacity-40 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 size-40 rounded-full bg-primary-fixed opacity-40 blur-2xl pointer-events-none" />

          <div className="relative flex items-center justify-between gap-8">
            <div className="flex items-start gap-6 max-w-2xl">
              <div className="size-18 rounded-full bg-surface-container-low flex items-center justify-center shrink-0 shadow-inner">
                <div className="size-13 rounded-full bg-primary flex items-center justify-center shadow-md animate-in zoom-in-50 duration-200">
                  <CheckCircleIcon className="text-on-primary" size={28} />
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-sans text-xs font-bold uppercase tracking-widest text-secondary">
                    Receipt Confirmed
                  </span>
                  <span className="text-outline-variant">•</span>
                  <span className="font-sans text-xs text-on-surface-variant">Dhaka Atelier Studio</span>
                </div>

                <h2 className="font-serif text-3xl font-medium text-on-surface leading-tight mb-2">
                  Shukriya, {customerName}!
                </h2>

                <p className="font-sans text-sm text-on-surface-variant leading-relaxed">
                  Your curated parcel has been scheduled for personalized atelier packaging. Each heirloom item is inspected, certified, and enclosed in our signature keepsake box before courier handover.
                </p>
              </div>
            </div>

            {/* Desktop Order ID Pill & SMS Status */}
            <div className="flex flex-col gap-3 shrink-0 min-w-[320px]">
              <div className="bg-surface-container-low rounded-xl p-4 flex items-center justify-between gap-4 border border-border-subtle shadow-2xs">
                <div className="flex items-center gap-3">
                  <ReceiptIcon className="text-primary shrink-0" size={22} />
                  <div className="flex flex-col">
                    <span className="font-sans text-[11px] text-on-surface-variant font-medium">
                      Order Identifier
                    </span>
                    <span className="font-mono text-base font-bold text-on-surface tracking-wider">
                      #{orderId}
                    </span>
                  </div>
                </div>

                <button
                  aria-label="Copy Order Identifier"
                  className="h-8 px-3.5 rounded-full bg-surface-container-lowest text-primary text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-surface-container active:scale-95 transition-colors duration-150 transition-transform shrink-0 border border-border-subtle/80 cursor-pointer"
                  onClick={handleCopyOrderId}
                  type="button"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="text-success" size={14} />
                      <span className="text-success font-bold">Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={14} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2.5 bg-secondary-fixed/30 rounded-xl px-4 py-2.5 border border-secondary-fixed/50">
                <ChatCheckIcon className="text-secondary shrink-0" size={17} />
                <span className="font-sans text-xs text-on-surface-variant">
                  Receipt dispatched to <strong className="font-mono text-on-surface font-semibold">{formattedPhone}</strong>
                </span>
              </div>
            </div>
          </div>
        </section>
      );
    }

    // Mobile Hero Layout
    return (
      <section className="relative overflow-hidden rounded-2xl bg-surface-container-lowest p-6 sm:p-8 shadow-sm border border-border-subtle">
        <div className="absolute -top-12 -right-12 size-36 rounded-full bg-secondary-fixed opacity-40 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 size-28 rounded-full bg-primary-fixed opacity-40 blur-xl pointer-events-none" />

        <div className="relative flex flex-col items-center text-center">
          <div className="size-16 rounded-full bg-surface-container-low flex items-center justify-center mb-3.5 shadow-inner">
            <div className="size-12 rounded-full bg-primary flex items-center justify-center shadow-md animate-in zoom-in-50 duration-200">
              <CheckCircleIcon className="text-on-primary" size={26} />
            </div>
          </div>

          <span className="font-sans text-[11px] font-bold uppercase tracking-widest text-secondary mb-1">
            Receipt Confirmed
          </span>

          <h2 className="font-serif text-2xl sm:text-3xl text-on-surface font-medium leading-tight mb-2">
            Shukriya, {customerName}!
          </h2>

          <p className="font-sans text-xs sm:text-sm text-on-surface-variant max-w-sm mb-4 leading-relaxed">
            Your curated parcel has been scheduled for personalized atelier packaging.
          </p>

          {/* Order Identifier Pill */}
          <div className="w-full bg-surface-container-low rounded-xl p-3 sm:p-3.5 flex items-center justify-between gap-3 mb-3 border border-border-subtle">
            <div className="flex items-center gap-2.5 text-left min-w-0">
              <ReceiptIcon className="text-primary shrink-0" size={20} />
              <div className="flex flex-col min-w-0">
                <span className="font-sans text-[11px] text-on-surface-variant font-medium">
                  Order Identifier
                </span>
                <span className="font-mono text-sm sm:text-base font-bold text-on-surface tracking-wide truncate">
                  #{orderId}
                </span>
              </div>
            </div>

            <button
              aria-label="Copy Order Identifier"
              className="h-8 px-3.5 rounded-full bg-surface-container-lowest text-primary text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:bg-surface-container active:scale-95 transition-colors duration-150 transition-transform shrink-0 border border-border-subtle/80 cursor-pointer"
              onClick={handleCopyOrderId}
              type="button"
            >
              {copied ? (
                <>
                  <CheckIcon className="text-success" size={14} />
                  <span className="text-success font-bold">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon size={14} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* SMS / WhatsApp Dispatch Reassurance */}
          <div className="flex items-center gap-2.5 bg-secondary-fixed/30 rounded-xl px-3.5 py-2.5 w-full text-left border border-secondary-fixed/50">
            <ChatCheckIcon className="text-secondary shrink-0" size={18} />
            <p className="font-sans text-xs text-on-surface-variant">
              Notification receipt dispatched to{' '}
              <strong className="font-semibold text-on-surface font-mono">{formattedPhone}</strong> via
              SMS &amp; WhatsApp.
            </p>
          </div>
        </div>
      </section>
    );
  };

  // 2. Delivery Progress & Interactive 4-Node Live Timeline
  const renderDeliveryProgress = () => (
    <section className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TruckIcon className="text-primary" size={22} />
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            Delivery Progress
          </h3>
        </div>
        <span className="bg-secondary-fixed/60 text-primary px-3 py-1 rounded-full font-sans text-xs font-semibold border border-secondary-fixed">
          {deliveryModeLabel}
        </span>
      </div>

      {/* Estimated Handover Banner */}
      <div className="bg-surface-container-low rounded-xl p-3.5 flex items-center gap-3 border border-border-subtle/60">
        <div className="size-9 rounded-full bg-surface-container-lowest flex items-center justify-center text-primary shadow-xs shrink-0 border border-border-subtle">
          <CalendarIcon size={18} />
        </div>
        <div className="flex flex-col">
          <span className="font-sans text-[11px] text-on-surface-variant font-medium">
            Estimated Handover
          </span>
          <span className="font-sans text-xs sm:text-sm font-semibold text-on-surface">
            {etaLabel}
          </span>
        </div>
      </div>

      {/* Vertical Timeline Steps */}
      <div className="relative pl-6 flex flex-col gap-4 pt-1">
        <div className="absolute left-2.5 top-2.5 bottom-2.5 w-0.5 bg-surface-container-high" />

        {/* Step 1: Order Placed (Completed) */}
        <div className="relative flex items-start gap-3">
          <div className="absolute -left-6 top-0.5 size-5 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-xs">
            <CheckIcon size={11} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-sans text-xs sm:text-sm font-semibold text-on-surface">
                Order Placed
              </span>
              <span className="font-sans text-[11px] text-secondary font-medium">
                Today · Just now
              </span>
            </div>
            <span className="font-sans text-xs text-on-surface-variant">
              {paymentBadge.isPending
                ? `TrxID submitted via ${paymentBadge.name}. Atelier accounts verifying statement.`
                : !paymentBadge.isPaid
                ? 'Doorstep cash on delivery confirmed.'
                : `Payment verified via ${paymentBadge.name}.`}
            </span>
          </div>
        </div>

        {/* Step 2: Atelier Inspection & Gift Wrap (Active) */}
        <div className="relative flex items-start gap-3">
          <div className="absolute -left-6 top-0.5 size-5 rounded-full bg-primary-fixed text-primary flex items-center justify-center shadow-xs ring-4 ring-surface-container-lowest">
            <SparklesIcon size={12} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-sans text-xs sm:text-sm text-primary font-bold">
                Atelier Inspection &amp; Gift Wrap
              </span>
              <span className="bg-primary-fixed text-primary px-2 py-0.5 rounded-full font-sans text-[10px] font-bold">
                Active
              </span>
            </div>
            <span className="font-sans text-xs text-on-surface-variant">
              Quality inspection &amp; personalized calligraphy card packaging in progress.
            </span>
          </div>
        </div>

        {/* Step 3: Courier Dispatched (Upcoming) */}
        <div className="relative flex items-start gap-3 opacity-60">
          <div className="absolute -left-6 top-0.5 size-5 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center">
            <span className="size-2 rounded-full bg-outline-variant" />
          </div>
          <div className="flex flex-col">
            <span className="font-sans text-xs sm:text-sm font-medium text-on-surface">
              Courier Dispatched
            </span>
            <span className="font-sans text-xs text-on-surface-variant">
              Parcel handed over to {isDhaka ? 'Pathao Express' : 'Steadfast Courier'} with tracking ID.
            </span>
          </div>
        </div>

        {/* Step 4: Doorstep Handover (Upcoming) */}
        <div className="relative flex items-start gap-3 opacity-60">
          <div className="absolute -left-6 top-0.5 size-5 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center">
            <span className="size-2 rounded-full bg-outline-variant" />
          </div>
          <div className="flex flex-col">
            <span className="font-sans text-xs sm:text-sm font-medium text-on-surface">
              Delivered &amp; Unboxed
            </span>
            <span className="font-sans text-xs text-on-surface-variant">
              Doorstep open-box inspection before rider signoff.
            </span>
          </div>
        </div>
      </div>
    </section>
  );

  // 3. Shipping Destination & Courier Partner Information Card
  const renderShippingDestination = () => (
    <section className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <MapPinIcon className="text-primary" size={20} />
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            Shipping &amp; Delivery Destination
          </h3>
        </div>
        <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 text-xs font-semibold text-primary border border-border-subtle">
          Doorstep Delivery
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <div className="flex flex-col gap-1 p-3.5 rounded-xl bg-surface-container-low border border-border-subtle/60">
          <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-secondary">
            Recipient Details
          </span>
          <span className="font-sans text-sm font-semibold text-on-surface">
            {recipientName}
          </span>
          <span className="font-mono text-xs text-on-surface-variant">
            {formattedPhone}
          </span>
        </div>

        <div className="flex flex-col gap-1 p-3.5 rounded-xl bg-surface-container-low border border-border-subtle/60">
          <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-secondary">
            Courier Service
          </span>
          <span className="font-sans text-sm font-semibold text-on-surface">
            {isDhaka ? 'Pathao Express / Paperfly' : 'Steadfast Courier Network'}
          </span>
          <span className="font-sans text-xs text-on-surface-variant">
            {isDhaka ? '24–48 Hours Transit' : '2–4 Business Days Nationwide'}
          </span>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-surface-container-low border border-border-subtle/60 flex flex-col gap-1 text-xs">
        <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-secondary">
          Delivery Street Address
        </span>
        <p className="font-sans text-sm text-on-surface leading-relaxed">
          {streetAddress}, {district}
        </p>
        <p className="text-[11px] text-on-surface-variant mt-1">
          Rider will call your mobile number prior to dispatch. Open-box inspection is guaranteed.
        </p>
      </div>
    </section>
  );

  // 4. Curated Items Receipt & Financial Breakdown Card
  const renderOrderItemsReceipt = () => (
    <section className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
        <div className="flex items-center gap-2">
          <ShoppingBagIcon className="text-primary" size={20} />
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            Curated Items ({items.length})
          </h3>
        </div>
        <span className="font-sans text-xs text-on-surface-variant">Atelier Parcel</span>
      </div>

      {/* Item List */}
      <div className="flex flex-col divide-y divide-border-subtle">
        {items.map((item) => (
          <div className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0" key={item.id}>
            <div className="relative size-16 sm:size-18 shrink-0 overflow-hidden rounded-xl bg-surface-container-low border border-border-subtle">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={item.imageAlt || item.productTitle}
                  className="size-full object-cover"
                  src={item.imageUrl}
                />
              ) : (
                <div className="size-full flex items-center justify-center text-outline">
                  <ReceiptIcon size={24} />
                </div>
              )}
            </div>

            <div className="flex flex-col justify-between flex-1 min-w-0">
              <span className="font-sans text-xs sm:text-sm font-semibold text-on-surface truncate">
                {item.productTitle}
              </span>
              <span className="font-sans text-xs text-on-surface-variant">
                {item.variantDescription} · Qty: {item.quantity}
              </span>
              <span className="font-mono text-xs sm:text-sm font-bold text-on-surface tabular-nums mt-0.5">
                ৳{item.net.toLocaleString('en-BD')}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Packaging Perk Highlight */}
      <div className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container-low border border-border-subtle">
        <CardGiftcardIcon className="text-primary shrink-0" size={18} />
        <span className="font-sans text-xs text-on-surface-variant">
          Complimentary handwritten calligraphy card &amp; Maevelle luxury keepsake box included.
        </span>
      </div>

      {/* Payment Method Badge */}
      <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-low border border-border-subtle">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="size-7 rounded-full text-white flex items-center justify-center font-bold text-[11px] shadow-xs shrink-0"
              style={{ backgroundColor: paymentBadge.color }}
            >
              {paymentBadge.initials}
            </div>
            <div className="flex flex-col">
              <span className="font-sans text-xs font-semibold text-on-surface">
                {paymentBadge.name}
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant truncate max-w-[200px] sm:max-w-none">
                {paymentBadge.sub}
              </span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 font-sans text-xs font-semibold px-2 py-0.5 rounded-full ${
              paymentBadge.isPaid
                ? 'bg-success/10 text-success'
                : paymentBadge.isPending
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                : 'bg-surface-container text-on-surface-variant'
            }`}
          >
            {paymentBadge.isPaid ? (
              <VerifiedIcon size={14} />
            ) : paymentBadge.isPending ? (
              <ClockIcon size={14} />
            ) : null}
            <span>{paymentBadge.statusLabel}</span>
          </div>
        </div>

        {paymentBadge.isPending ? (
          <div className="text-[11px] text-on-surface-variant pt-2 border-t border-border-subtle/60 leading-relaxed flex items-center gap-1.5">
            <ClockIcon className="text-amber-600 dark:text-amber-400 shrink-0" size={13} />
            <span>
              Our accounts team verifies manual transfers within 15–30 minutes. You will receive an SMS confirmation once matched.
            </span>
          </div>
        ) : null}
      </div>

      {/* Financial Calculation */}
      <div className="flex flex-col gap-2 pt-1 border-t border-border-subtle text-xs text-on-surface-variant">
        <div className="flex justify-between items-center">
          <span>Subtotal</span>
          <span className="font-mono font-semibold text-on-surface tabular-nums">
            ৳{subtotal.toLocaleString('en-BD')}
          </span>
        </div>

        {discount > 0 ? (
          <div className="flex justify-between items-center text-primary">
            <span className="flex items-center gap-1">
              Voucher Code{' '}
              <span className="bg-primary-fixed text-primary px-1.5 py-0.5 rounded text-[10px] font-bold font-mono">
                {voucherCode || 'MAEVELLEFIRST'}
              </span>
            </span>
            <span className="font-mono font-semibold tabular-nums">
              -৳{discount.toLocaleString('en-BD')}
            </span>
          </div>
        ) : null}

        <div className="flex justify-between items-center">
          <span>{deliveryModeLabel}</span>
          <span className="font-mono font-semibold text-on-surface tabular-nums">
            ৳{shippingFee.toLocaleString('en-BD')}
          </span>
        </div>

        <div className="my-1 h-px w-full bg-border-subtle" />

        <div className="flex justify-between items-baseline">
          <span className="font-serif text-sm sm:text-base font-semibold text-on-surface">
            Total Paid
          </span>
          <div className="text-right">
            <span className="font-mono text-xl sm:text-2xl font-bold text-primary tabular-nums">
              {formattedTotal}
            </span>
            <p className="font-sans text-[10px] text-on-surface-variant">VAT inclusive</p>
          </div>
        </div>
      </div>
    </section>
  );

  // 5. The Maevelle Promise & Support
  const renderMaevellePromise = () => (
    <section className="rounded-2xl bg-surface-container-lowest p-5 sm:p-6 shadow-sm border border-border-subtle flex flex-col gap-4">
      <div className="flex items-center gap-2 pb-2 border-b border-border-subtle">
        <VerifiedIcon className="text-secondary" size={20} />
        <div>
          <h3 className="font-serif text-base sm:text-lg font-semibold text-on-surface">
            The Maevelle Promise
          </h3>
          <p className="text-xs text-on-surface-variant">
            Atelier craftsmanship &amp; doorstep client care
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-1 border border-border-subtle/50">
          <PackageCheckIcon className="text-primary" size={20} />
          <span className="font-sans text-xs font-semibold text-on-surface">
            Doorstep Check
          </span>
          <span className="font-sans text-[11px] text-on-surface-variant leading-tight">
            Inspect your jewelry box prior to rider handover.
          </span>
        </div>

        <div className="bg-surface-container-low p-3.5 rounded-xl flex flex-col gap-1 border border-border-subtle/50">
          <RefreshCwIcon className="text-primary" size={20} />
          <span className="font-sans text-xs font-semibold text-on-surface">
            7-Day Exchange
          </span>
          <span className="font-sans text-[11px] text-on-surface-variant leading-tight">
            Instant complimentary replacement for any fit issue.
          </span>
        </div>
      </div>

      {/* Concierge Action Rows */}
      <div className="flex flex-col gap-2 pt-1">
        {/* WhatsApp Concierge */}
        <a
          className="w-full h-12 rounded-xl bg-surface-container-low text-on-surface flex items-center justify-between px-4 hover:bg-surface-container active:scale-[0.99] transition-colors duration-150 transition-transform border border-border-subtle"
          href="https://wa.me/8801894623835"
          rel="noopener noreferrer"
          target="_blank"
        >
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-secondary-fixed flex items-center justify-center text-primary">
              <SupportAgentIcon size={18} />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-sans text-xs font-semibold text-on-surface">
                WhatsApp Concierge
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant">
                +880 1894-MAEVELLE
              </span>
            </div>
          </div>
          <span className="text-secondary text-sm font-semibold">→</span>
        </a>

        {/* Download PDF Invoice */}
        <button
          className="w-full h-12 rounded-xl bg-surface-container-low text-on-surface flex items-center justify-between px-4 hover:bg-surface-container active:scale-[0.99] transition-colors duration-150 transition-transform border border-border-subtle cursor-pointer"
          disabled={isDownloading}
          onClick={handleDownloadInvoice}
          type="button"
        >
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant">
              <DownloadIcon size={18} />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-sans text-xs font-semibold text-on-surface">
                Download PDF Invoice
              </span>
              <span className="font-sans text-[11px] text-on-surface-variant">
                Official Tax &amp; Warranty Card
              </span>
            </div>
          </div>
          <DownloadIcon className="text-secondary" size={16} />
        </button>
      </div>
    </section>
  );

  // 6. Action Buttons
  const renderActionButtons = (isDesktop: boolean) => (
    <section className={`flex flex-col gap-2.5 ${isDesktop ? 'pt-0' : 'pt-2 pb-6'}`}>
      <button
        className="w-full h-12 rounded-xl bg-primary text-on-primary font-sans text-xs sm:text-sm font-semibold shadow-md hover:bg-primary-hover active:scale-[0.98] transition-colors duration-150 transition-transform flex items-center justify-center gap-2 cursor-pointer"
        onClick={() => {
          router.push(`/orders/track?orderId=${encodeURIComponent(orderId)}&phone=${encodeURIComponent(cleanPhone)}`);
        }}
        type="button"
      >
        <TruckIcon size={18} />
        <span>Track Order Status</span>
      </button>

      <Link
        className="w-full h-12 rounded-xl bg-surface-container-lowest text-primary font-sans text-xs sm:text-sm font-semibold shadow-xs border border-border-subtle hover:bg-surface-container-low active:scale-[0.98] transition-colors duration-150 transition-transform flex items-center justify-center gap-2 text-center"
        href="/"
      >
        <StorefrontIcon size={18} />
        <span>Continue Exploring Vault</span>
      </Link>
    </section>
  );

  /* -------------------------------------------------------------
     MAIN RESPONSIVE RETURN
  -------------------------------------------------------------- */
  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-3 duration-300">
      {/* ---------------- MOBILE & TABLET LAYOUT (< lg) ---------------- */}
      <div className="flex flex-col gap-4 lg:hidden">
        {renderHero(false)}
        {renderDeliveryProgress()}
        {renderOrderItemsReceipt()}
        {renderShippingDestination()}
        {renderMaevellePromise()}
        {renderActionButtons(false)}
      </div>

      {/* ---------------- DESKTOP & LARGER SCREENS (lg+) ---------------- */}
      <div className="hidden lg:flex lg:flex-col lg:gap-8">
        {/* 1. Full-Width Top Editorial Hero Banner */}
        {renderHero(true)}

        {/* 2. Balanced 2-Column Luxury Atelier Dashboard (7 cols / 5 cols) */}
        <div className="grid grid-cols-12 gap-8 items-start">
          {/* Left Column (7 cols): Logistics, Destination & Atelier Promise */}
          <div className="col-span-7 flex flex-col gap-6">
            {renderDeliveryProgress()}
            {renderShippingDestination()}
            {renderMaevellePromise()}
          </div>

          {/* Right Column (5 cols, Sticky): Order Items Receipt, Payment Status & Quick Actions */}
          <div className="col-span-5 flex flex-col gap-6 sticky top-8">
            {renderOrderItemsReceipt()}
            {renderActionButtons(true)}
          </div>
        </div>
      </div>
    </div>
  );
}
