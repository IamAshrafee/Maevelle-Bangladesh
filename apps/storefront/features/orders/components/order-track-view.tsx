'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { ApiEnvelope, PublicOrderTrackingDto } from '@maevelle/contracts';
import { TruckIcon, StorefrontIcon } from '@/components/ui/icons';
import { type ConsignmentData, transformPublicTrackingToConsignment } from '../types';
import { OrderTrackHeader } from './order-track-header';
import { OrderTrackLookupCard } from './order-track-lookup-card';
import { OrderTrackActiveConsignment } from './order-track-active-consignment';
import { OrderTrackParcelContents } from './order-track-parcel-contents';
import { OrderTrackReassurance } from './order-track-reassurance';

export function OrderTrackView() {
  const searchParams = useSearchParams();
  const initialOrder = searchParams.get('orderId') || searchParams.get('orderNumber') || '';
  const initialPhone = searchParams.get('phone') || '';

  const [orderId, setOrderId] = useState(initialOrder);
  const [phone, setPhone] = useState(initialPhone);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [consignment, setConsignment] = useState<ConsignmentData | null>(null);

  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const cleanOrderNumber = (val: string) => val.trim().replace(/^#/, '');
  const cleanPhoneNumber = (val: string) => val.trim().replace(/[^0-9]/g, '');

  const performLookup = useCallback(async (num: string, ph: string) => {
    const currentGeneration = ++generation.current;
    setConsignment(null);
    const rawNum = num.trim();
    const cleanNum = cleanOrderNumber(rawNum);
    const cleanPh = cleanPhoneNumber(ph);

    if (!cleanNum || !cleanPh) {
      setErrorMessage('Please enter both your Order Identifier and Phone Number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/storefront/v1/orders/track', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderNumber: cleanNum,
          phone: cleanPh,
        }),
      });

      if (currentGeneration !== generation.current) return;
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message ??
            `Order #${cleanNum} was not found for +880 ${cleanPh}. Please verify your details.`,
        );
      }

      const result = (await response.json()) as ApiEnvelope<PublicOrderTrackingDto>;
      if (result.data) {
        const transformed = transformPublicTrackingToConsignment(result.data);
        setConsignment(transformed);
      } else {
        throw new Error('Order data could not be parsed.');
      }
    } catch (err) {
      if (currentGeneration !== generation.current) return;
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to track this Order. Check your details or try again.',
      );
    } finally {
      if (currentGeneration === generation.current) {
        setIsLoading(false);
        document
          .getElementById('status-card')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, []);

  // Handle Mount: Run search if query params were passed from checkout or external link
  useEffect(() => {
    const qOrder = searchParams.get('orderId') || searchParams.get('orderNumber');
    const qPhone = searchParams.get('phone');

    if (qOrder && qPhone) {
      setOrderId(qOrder);
      setPhone(qPhone);
      void performLookup(qOrder, qPhone);
      return;
    }

    // Try reading confirmation cookie for recent checkout
    void (async () => {
      try {
        const response = await fetch('/api/storefront/v1/orders/confirmation', {
          credentials: 'include',
        });
        if (response.ok) {
          const confirmation = (await response.json()) as ApiEnvelope<{
            orderNumber: string;
            customer: { phone: string };
          }>;
          if (confirmation?.data?.orderNumber && confirmation?.data?.customer?.phone) {
            setOrderId(confirmation.data.orderNumber);
            setPhone(confirmation.data.customer.phone);
            void performLookup(confirmation.data.orderNumber, confirmation.data.customer.phone);
          }
        }
      } catch {
        // No authorized response: keep the tracking result unavailable.
      }
    })();
  }, [searchParams, performLookup]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(orderId, phone);
  };

  return (
    <div className="relative min-h-screen w-full bg-surface">
      {/* Mobile Top Header */}
      <OrderTrackHeader />

      {/* Main Content Area */}
      <main className="w-full pb-20 pt-4 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          {/* ==============================================================
              1. EDITORIAL HEADER & INTRO (Full Width)
          ============================================================== */}
          <section className="flex flex-col pt-2 pb-5 sm:pb-8">
            <div className="inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant mb-2.5 border border-primary-fixed-dim/40 shadow-2xs">
              <TruckIcon size={14} />
              <span className="font-sans text-[11px] font-bold uppercase tracking-wider">
                Concierge Dispatch
              </span>
            </div>

            <h2 className="font-serif text-2xl sm:text-4xl text-on-surface font-semibold tracking-tight">
              Track Your Order
            </h2>

            <p className="font-sans text-sm sm:text-base text-on-surface-variant mt-2 leading-relaxed max-w-2xl">
              Follow your handcrafted heirlooms delivered directly to your doorstep across
              Bangladesh.
            </p>
          </section>

          {/* ==============================================================
              2. DUAL RESPONSIVE LAYOUT
          ============================================================== */}

          {/* ---------------- MOBILE & TABLET LAYOUT (< lg) ---------------- */}
          <div className="flex flex-col gap-5 lg:hidden max-w-lg mx-auto">
            <OrderTrackLookupCard
              errorMessage={errorMessage}
              isLoading={isLoading}
              onOrderIdChange={setOrderId}
              onPhoneChange={setPhone}
              onSubmit={handleSubmit}
              orderId={orderId}
              phone={phone}
            />

            {consignment && <OrderTrackActiveConsignment consignment={consignment} />}

            {consignment && <OrderTrackParcelContents consignment={consignment} />}

            <OrderTrackReassurance />

            {/* Return to Store Link */}
            <div className="pt-2 text-center">
              <Link
                className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-surface-container-low text-primary font-sans text-xs sm:text-sm font-semibold hover:bg-surface-container active:scale-[0.98] transition-colors border border-border-subtle"
                href="/"
              >
                <StorefrontIcon size={16} />
                <span>Return to Maevelle Store</span>
              </Link>
            </div>
          </div>

          {/* ---------------- DESKTOP & LARGER SCREENS (lg+) ---------------- */}
          <div className="hidden lg:grid lg:grid-cols-12 lg:gap-8 items-start">
            {/* Left Column (7 cols): Lookup Card & Active Consignment Stepper */}
            <div className="col-span-7 flex flex-col gap-6">
              <OrderTrackLookupCard
                errorMessage={errorMessage}
                isLoading={isLoading}
                onOrderIdChange={setOrderId}
                onPhoneChange={setPhone}
                onSubmit={handleSubmit}
                orderId={orderId}
                phone={phone}
              />

              {consignment && <OrderTrackActiveConsignment consignment={consignment} />}
            </div>

            {/* Right Column (5 cols, sticky top-24): Parcel Contents, Reassurance & Help */}
            <div className="col-span-5 flex flex-col gap-6 sticky top-24">
              {consignment && <OrderTrackParcelContents consignment={consignment} />}

              <OrderTrackReassurance />

              <Link
                className="inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-surface-container-low text-primary font-sans text-sm font-semibold hover:bg-surface-container active:scale-[0.98] transition-colors border border-border-subtle"
                href="/"
              >
                <StorefrontIcon size={18} />
                <span>Return to Maevelle Store</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
