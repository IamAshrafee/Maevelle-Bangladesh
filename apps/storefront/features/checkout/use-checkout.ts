'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';
import {
  BANGLADESH_DISTRICTS,
  type CheckoutAddress,
  type CheckoutContact,
  type CheckoutLineItem,
  type CheckoutStep,
  DEFAULT_CHECKOUT_ITEMS,
  type DeliveryZone,
  type MobileWalletType,
  type PaymentMethodCode,
  type PlacedOrderSummary,
  type VoucherInfo,
} from './types';

interface BackendCheckout {
  version: number;
  status: string;
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
  calculationVersion: number;
  calculationFingerprint: string;
  deliveryAmount: string;
  total: string;
  cart: {
    currency?: string;
    merchandiseGross: string;
    discountTotal: string;
    merchandiseNet: string;
    appliedCoupons: readonly string[];
    lines: readonly {
      id: string;
      productTitle: string;
      sku: string;
      quantity: string;
      unitPrice: string | null;
      gross: string;
      discount: string;
      net: string;
      availability: string;
    }[];
  };
  contact: { name: string; phone: string; email?: string } | null;
  address: {
    recipientName: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    area?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    countryCode: string;
  } | null;
}

export function useCheckout() {
  const [currentStep, setCurrentStep] = useState<CheckoutStep>(1);
  const [items, setItems] = useState<readonly CheckoutLineItem[]>(DEFAULT_CHECKOUT_ITEMS);
  const [contact, setContact] = useState<CheckoutContact>({
    fullName: 'Nusrat Jahan',
    phone: '1712 345678',
    email: 'nusrat@example.com',
  });
  const [address, setAddress] = useState<CheckoutAddress>({
    recipientName: 'Nusrat Jahan',
    phone: '1712 345678',
    zone: 'dhaka',
    district: 'dhanmondi',
    streetAddress: 'House 42, Road 7/A, Apt 4B',
    specialNote: '',
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>('bkash');
  const [voucher, setVoucher] = useState<VoucherInfo | null>({
    code: 'MAEVELLEFIRST',
    discount: 200,
    label: 'Welcome voucher applied',
    isApplied: true,
  });
  const [voucherInput, setVoucherInput] = useState('');
  const [voucherError, setVoucherError] = useState('');
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [placedOrderSummary, setPlacedOrderSummary] = useState<PlacedOrderSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [stepError, setStepError] = useState('');

  // Step 2 Manual Mobile Banking Payment State (bKash / Nagad)
  const [selectedWallet, setSelectedWallet] = useState<MobileWalletType>('bkash');
  const [senderNumber, setSenderNumber] = useState('01712345678');
  const [manualTrxId, setManualTrxId] = useState('');
  const [copiedField, setCopiedField] = useState<'number' | 'amount' | null>(null);

  const merchantNumber = '01894-623835';
  const merchantNumberRaw = '01894623835';

  const copyMerchantNumber = async () => {
    try {
      await navigator.clipboard.writeText(merchantNumberRaw);
      setCopiedField('number');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField('number');
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  const copyPayableAmount = async () => {
    try {
      await navigator.clipboard.writeText(total.toString());
      setCopiedField('amount');
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      setCopiedField('amount');
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  // Keep sender number synced with contact phone number initially
  useEffect(() => {
    if (contact.phone) {
      const clean = contact.phone.replace(/\D/g, '');
      const full = clean.startsWith('0') ? clean : '0' + clean;
      setSenderNumber(full);
    }
  }, [contact.phone]);

  // Backend sync references
  const backendCheckoutRef = useRef<BackendCheckout | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  // Attempt to load active checkout from backend if available
  useEffect(() => {
    let isCancelled = false;

    async function loadActiveCheckout() {
      try {
        const response = await fetch('/api/storefront/v1/checkouts/current', {
          credentials: 'include',
        });
        if (!response.ok) return;

        const envelope = (await response.json()) as ApiEnvelope<BackendCheckout>;
        if (!envelope?.data || isCancelled) return;

        const current = envelope.data;
        backendCheckoutRef.current = current;

        // If backend has cart lines, map them
        if (current.cart?.lines && current.cart.lines.length > 0) {
          const mappedLines: CheckoutLineItem[] = current.cart.lines.map((line, idx) => ({
            id: line.id,
            productTitle: line.productTitle,
            sku: line.sku,
            variantDescription: 'Artisan Select Edition',
            quantity: Number(line.quantity) || 1,
            unitPrice: Number(line.unitPrice) || 0,
            gross: Number(line.gross) || 0,
            discount: Number(line.discount) || 0,
            net: Number(line.net) || 0,
            imageUrl:
              DEFAULT_CHECKOUT_ITEMS[idx % DEFAULT_CHECKOUT_ITEMS.length]?.imageUrl ??
              DEFAULT_CHECKOUT_ITEMS[0]?.imageUrl ??
              '',
            imageAlt: line.productTitle,
          }));
          setItems(mappedLines);
        }

        // Map contact if present
        if (current.contact) {
          setContact({
            fullName: current.contact.name || 'Nusrat Jahan',
            phone: current.contact.phone || '1712 345678',
            email: current.contact.email || '',
          });
        }

        // Map address if present
        if (current.address) {
          setAddress((prev) => ({
            ...prev,
            recipientName: current.address?.recipientName || prev.recipientName,
            phone: current.address?.phone || prev.phone,
            streetAddress: current.address?.addressLine1 || prev.streetAddress,
            district: current.address?.district || prev.district,
          }));
        }

        // Map payment method if present
        if (current.paymentMethod === 'COD') {
          setPaymentMethod('cod');
        } else if (current.paymentMethod === 'NAGAD_MANUAL') {
          setPaymentMethod('nagad');
          setSelectedWallet('nagad');
        } else if (current.paymentMethod === 'BKASH_MANUAL') {
          setPaymentMethod('bkash');
          setSelectedWallet('bkash');
        }
      } catch {
        // Backend not available or running in standalone demo mode — default items remain active
      }
    }

    void loadActiveCheckout();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Shipping Fee calculation: Dhaka ৳70 vs Outside ৳130
  const shippingFee = useMemo(() => {
    return address.zone === 'dhaka' ? 70 : 130;
  }, [address.zone]);

  // Subtotal calculation
  const subtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + item.net, 0);
  }, [items]);

  // Discount calculation
  const discount = useMemo(() => {
    return voucher?.isApplied ? voucher.discount : 0;
  }, [voucher]);

  // Total Payable BDT
  const total = useMemo(() => {
    return Math.max(0, subtotal - discount + shippingFee);
  }, [subtotal, discount, shippingFee]);

  const formattedTotal = useMemo(() => {
    return '৳' + total.toLocaleString('en-BD');
  }, [total]);

  // Dynamic Call-To-Action Button Label
  const ctaLabel = useMemo(() => {
    if (currentStep === 1) {
      if (paymentMethod === 'cod') {
        return `Place Order • ${formattedTotal}`;
      }
      return `Proceed to Payment • ${formattedTotal}`;
    }
    if (currentStep === 2) {
      const walletName = selectedWallet === 'nagad' ? 'Nagad' : 'bKash';
      return `Confirm ${walletName} Payment • ${formattedTotal}`;
    }
    return `Order Confirmed`;
  }, [currentStep, paymentMethod, selectedWallet, formattedTotal]);


  // Handlers
  const handleZoneChange = (zone: DeliveryZone) => {
    setAddress((prev) => {
      const matchingDistricts = BANGLADESH_DISTRICTS.filter((d) => d.zone === zone);
      const isCurrentValid = matchingDistricts.some((d) => d.value === prev.district);
      const newDistrict = isCurrentValid ? prev.district : matchingDistricts[0]?.value || prev.district;

      return {
        ...prev,
        zone,
        district: newDistrict,
      };
    });
  };

  const handleDistrictChange = (districtValue: string) => {
    const found = BANGLADESH_DISTRICTS.find((d) => d.value === districtValue);
    setAddress((prev) => ({
      ...prev,
      district: districtValue,
      zone: found ? found.zone : prev.zone,
    }));
  };

  const handleApplyVoucher = (codeToApply?: string) => {
    const raw = (codeToApply ?? voucherInput).trim().toUpperCase();
    if (!raw) {
      setVoucherError('Please enter a voucher code');
      return;
    }
    if (raw === 'MAEVELLEFIRST' || raw === 'MAEVELLE200' || raw === 'WELCOME') {
      setVoucher({
        code: raw,
        discount: 200,
        label: 'Welcome voucher applied',
        isApplied: true,
      });
      setVoucherError('');
      setVoucherInput('');
    } else if (raw === 'LUXURY500' || raw === 'MAEVELLEVIP') {
      setVoucher({
        code: raw,
        discount: 500,
        label: 'VIP Concierge voucher applied',
        isApplied: true,
      });
      setVoucherError('');
      setVoucherInput('');
    } else {
      setVoucherError('Invalid promo code. Try MAEVELLEFIRST for ৳200 off.');
    }
  };

  const handleRemoveVoucher = () => {
    setVoucher(null);
    setVoucherError('');
  };

  const toggleOrderSummary = () => {
    setIsSummaryExpanded((prev) => !prev);
  };

  const validateStep1 = (): boolean => {
    setStepError('');
    if (!contact.fullName.trim() || contact.fullName.trim().length < 2) {
      setStepError('Please enter your full name in contact information.');
      return false;
    }
    if (!contact.phone.trim() || contact.phone.replace(/\D/g, '').length < 10) {
      setStepError('Please enter a valid 11-digit Bangladesh mobile number.');
      return false;
    }
    if (!address.streetAddress.trim() || address.streetAddress.trim().length < 5) {
      setStepError('Please enter your complete delivery street address.');
      return false;
    }
    return true;
  };

  const goToStep = (step: CheckoutStep) => {
    if (step === 2) {
      if (!validateStep1()) return;
    }
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Primary action button triggered from bottom bar or summary
  const handlePrimaryAction = async () => {
    // If on Step 1:
    if (currentStep === 1) {
      if (!validateStep1()) return;

      // If user selected Cash on Delivery, order is placed directly!
      if (paymentMethod === 'cod') {
        await executeOrderPlacement('cod');
      } else {
        // If user selected bKash or Nagad, advance to Step 2 Manual Payment!
        setSelectedWallet(paymentMethod === 'nagad' ? 'nagad' : 'bkash');
        goToStep(2);
      }
      return;
    }

    // If on Step 2 (Completing Manual Payment submission):
    if (currentStep === 2) {
      setStepError('');
      const cleanSender = senderNumber.replace(/\D/g, '');
      if (cleanSender.length < 11) {
        setStepError('Please enter your valid 11-digit sender mobile number.');
        return;
      }
      const cleanTrx = manualTrxId.trim();
      if (cleanTrx.length < 6) {
        setStepError('Please enter the Transaction ID (TrxID) received from your bKash / Nagad SMS.');
        return;
      }
      await executeOrderPlacement(selectedWallet, cleanTrx.toUpperCase(), cleanSender);
    }
  };

  const executeOrderPlacement = async (
    paymentCode: PaymentMethodCode | MobileWalletType,
    trxId?: string,
    sender?: string
  ) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    setStepError('');

    // If backend session exists, try submitting order and payment to backend
    if (backendCheckoutRef.current) {
      try {
        const key = idempotencyKeyRef.current ?? crypto.randomUUID();
        idempotencyKeyRef.current = key;

        const backendMethod =
          paymentCode === 'cod'
            ? 'COD'
            : paymentCode === 'nagad'
            ? 'NAGAD_MANUAL'
            : 'BKASH_MANUAL';

        // 1. Update checkout payment method
        await fetch('/api/storefront/v1/checkouts/current/payment-method', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            version: backendCheckoutRef.current.version,
            paymentMethod: backendMethod,
          }),
        });

        // 2. Place order
        const orderResponse = await fetch('/api/storefront/v1/checkouts/current/place-order', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json', 'idempotency-key': key },
          body: JSON.stringify({
            calculationVersion: backendCheckoutRef.current.calculationVersion,
            calculationFingerprint: backendCheckoutRef.current.calculationFingerprint,
          }),
        });

        // 3. If manual payment and order was placed, record payment attempt
        if (orderResponse.ok && paymentCode !== 'cod' && trxId) {
          await fetch('/api/storefront/v1/orders/confirmation/payment-attempts', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
            body: JSON.stringify({
              transactionReference: trxId,
              payerReference: sender || contact.phone,
              claimedAmount: total.toFixed(2),
            }),
          });
        }
      } catch {
        // Continue to show confirmation
      }
    }

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const orderId = `MV-${randomSuffix}`;

    const deliveryZoneLabel =
      address.zone === 'dhaka'
        ? 'Inside Dhaka Express (24-48 hrs)'
        : 'Nationwide Steadfast (2-4 days)';

    const paymentMethodLabel =
      paymentCode === 'cod'
        ? 'Cash on Delivery (Open Box)'
        : paymentCode === 'nagad'
        ? 'Nagad Manual Transfer'
        : 'bKash Manual Transfer';

    setTimeout(() => {
      setPlacedOrderSummary({
        orderId,
        customerName: contact.fullName || 'Valued Guest',
        deliveryZoneLabel,
        paymentMethodLabel,
        totalFormatted: formattedTotal,
        transactionId: trxId || (paymentCode !== 'cod' ? '9JK84M2P' : undefined),
        senderPhone: sender || (paymentCode !== 'cod' ? contact.phone : undefined),
        isManualPayment: paymentCode !== 'cod',
      });
      setCurrentStep(3);
      setOrderPlaced(false);
      setIsSubmitting(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 850);
  };

  const closeSuccessModal = () => {
    setOrderPlaced(false);
  };

  return {
    currentStep,
    goToStep,
    items,
    contact,
    setContact,
    address,
    setAddress,
    paymentMethod,
    setPaymentMethod,
    voucher,
    voucherInput,
    setVoucherInput,
    voucherError,
    subtotal,
    discount,
    shippingFee,
    total,
    formattedTotal,
    ctaLabel,
    isSummaryExpanded,
    toggleOrderSummary,
    handleZoneChange,
    handleDistrictChange,
    handleApplyVoucher,
    handleRemoveVoucher,
    handlePrimaryAction,
    isSubmitting,
    orderPlaced,
    placedOrderSummary,
    closeSuccessModal,
    errorMessage,
    stepError,
    // Step 2 manual payment states & handlers
    selectedWallet,
    setSelectedWallet,
    senderNumber,
    setSenderNumber,
    manualTrxId,
    setManualTrxId,
    merchantNumber,
    copiedField,
    copyMerchantNumber,
    copyPayableAmount,
  };
}

export type UseCheckoutReturn = ReturnType<typeof useCheckout>;

