'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

interface Checkout {
  version: number;
  status: string;
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
  calculationVersion: number;
  calculationFingerprint: string;
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
interface PaymentMethod {
  code: Checkout['paymentMethod'];
  name: string;
  methodType: 'COD' | 'MOBILE_WALLET';
  instructions: { accountNumber?: string; text?: string };
}

function money(value: string) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 0,
  }).format(Number(value));
}
async function readError(
  response: Response,
): Promise<{ code?: string; message: string; checkout?: Checkout }> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; checkout?: Checkout };
  };
  const code = payload.error?.code;
  const friendly: Record<string, string> = {
    OUT_OF_STOCK: 'An item is no longer available. Return to your bag and choose another option.',
    PRICE_CHANGED: 'A price changed. Review the updated total before ordering.',
    PROMOTION_CHANGED: 'Your promotion changed. Review the updated total before ordering.',
    PAYMENT_METHOD_UNAVAILABLE: 'That payment method is unavailable. Choose another option.',
    VALIDATION_FAILED: 'Check the highlighted information and try again.',
    VERSION_CONFLICT:
      'Your checkout changed in another request. Refresh and review the latest details.',
    CHECKOUT_CHANGED:
      'Price, promotion, or availability changed. Review the updated checkout before ordering.',
  };
  return {
    ...(code ? { code } : {}),
    message:
      (code && friendly[code]) ||
      payload.error?.message ||
      'We could not complete that checkout step.',
    ...(payload.error?.checkout ? { checkout: payload.error.checkout } : {}),
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout>();
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethod[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState<string>();
  const idempotencyKey = useRef<string | undefined>(undefined);

  const load = async () => {
    let response = await fetch('/api/storefront/v1/checkouts/current', { credentials: 'include' });
    if (response.status === 404)
      response = await fetch('/api/storefront/v1/checkouts', {
        method: 'POST',
        credentials: 'include',
      });
    if (!response.ok) return setMessage((await readError(response)).message);
    const current = ((await response.json()) as ApiEnvelope<Checkout>).data;
    setCheckout(current);
    const methods = await fetch('/api/storefront/v1/checkouts/current/payment-methods', {
      credentials: 'include',
    });
    if (methods.ok)
      setPaymentMethods(((await methods.json()) as ApiEnvelope<readonly PaymentMethod[]>).data);
  };
  useEffect(() => {
    void load();
  }, []);

  async function save(
    path: 'contact' | 'address',
    body: Record<string, FormDataEntryValue | undefined>,
  ) {
    if (!checkout) return;
    setSaving(path);
    setMessage('');
    const response = await fetch(`/api/storefront/v1/checkouts/current/${path}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: checkout.version, ...body }),
    });
    if (!response.ok) throw new Error((await readError(response)).message);
    setCheckout(((await response.json()) as ApiEnvelope<Checkout>).data);
    setMessage(`${path === 'contact' ? 'Contact' : 'Delivery address'} saved.`);
  }
  async function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await save('contact', {
        name: data.get('name')!,
        phone: data.get('phone')!,
        email: data.get('email') || undefined,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Contact could not be saved.');
    } finally {
      setSaving(undefined);
    }
  }
  async function submitAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await save('address', {
        recipientName: data.get('recipientName')!,
        phone: data.get('deliveryPhone')!,
        addressLine1: data.get('addressLine1')!,
        addressLine2: data.get('addressLine2') || undefined,
        area: data.get('area') || undefined,
        city: data.get('city') || undefined,
        district: data.get('district') || undefined,
        postalCode: data.get('postalCode') || undefined,
        countryCode: data.get('countryCode')!,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Address could not be saved.');
    } finally {
      setSaving(undefined);
    }
  }
  async function selectPaymentMethod(paymentMethod: Checkout['paymentMethod']) {
    if (!checkout || saving || checkout.paymentMethod === paymentMethod) return;
    setSaving('payment');
    setMessage('');
    const response = await fetch('/api/storefront/v1/checkouts/current/payment-method', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: checkout.version, paymentMethod }),
    });
    if (response.ok) {
      setCheckout(((await response.json()) as ApiEnvelope<Checkout>).data);
      setMessage('Payment method updated.');
    } else setMessage((await readError(response)).message);
    setSaving(undefined);
  }
  async function placeOrder() {
    if (!checkout || saving) return;
    setSaving('order');
    setMessage('');
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    const response = await fetch('/api/storefront/v1/checkouts/current/place-order', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({
        calculationVersion: checkout.calculationVersion,
        calculationFingerprint: checkout.calculationFingerprint,
      }),
    });
    if (response.ok) return router.replace('/orders/confirmation');
    const error = await readError(response);
    if (error.checkout) setCheckout(error.checkout);
    if (
      [
        'CHECKOUT_CHANGED',
        'OUT_OF_STOCK',
        'PRICE_CHANGED',
        'PROMOTION_CHANGED',
        'PAYMENT_METHOD_UNAVAILABLE',
      ].includes(error.code ?? '')
    )
      idempotencyKey.current = undefined;
    if (error.code === 'CHECKOUT_COMPLETED') return router.replace('/orders/confirmation');
    setMessage(error.message);
    setSaving(undefined);
  }

  if (!checkout)
    return (
      <main>
        <section className="checkout-shell">
          <p className="eyebrow">Secure checkout</p>
          <h1>Checkout</h1>
          <div className="checkout-loading" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
          {message ? (
            <div className="checkout-message" role="alert">
              {message}
              <br />
              <Link href="/cart">Return to your bag</Link>
            </div>
          ) : null}
        </section>
      </main>
    );
  const selectedMethod = paymentMethods.find((method) => method.code === checkout.paymentMethod);
  return (
    <main>
      <section className="checkout-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/cart">Bag</Link>
          <span aria-hidden="true">/</span>
          <span>Checkout</span>
        </nav>
        <div className="checkout-heading">
          <div>
            <p className="eyebrow">Secure guest checkout</p>
            <h1>Complete your order</h1>
          </div>
          <p>
            <span aria-hidden="true">◇</span> Your details are protected
          </p>
        </div>
        {message ? (
          <p className="checkout-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="checkout-layout">
          <div className="checkout-forms">
            <form className="checkout-card" onSubmit={submitContact}>
              <header>
                <span>1</span>
                <div>
                  <h2>Contact</h2>
                  <p>We use this to confirm and support your order.</p>
                </div>
                {checkout.contact ? <strong>Saved</strong> : null}
              </header>
              <div className="form-grid">
                <label className="full">
                  Full name
                  <input
                    name="name"
                    autoComplete="name"
                    defaultValue={checkout.contact?.name}
                    required
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    defaultValue={checkout.contact?.phone}
                    placeholder="01XXXXXXXXX"
                    required
                  />
                </label>
                <label>
                  Email (optional)
                  <input
                    name="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    defaultValue={checkout.contact?.email}
                  />
                </label>
              </div>
              <button className="button-secondary" disabled={Boolean(saving)} type="submit">
                {saving === 'contact'
                  ? 'Saving…'
                  : checkout.contact
                    ? 'Update contact'
                    : 'Save contact'}
              </button>
            </form>
            <form className="checkout-card" onSubmit={submitAddress}>
              <header>
                <span>2</span>
                <div>
                  <h2>Delivery address</h2>
                  <p>Enter the address where someone can receive the parcel.</p>
                </div>
                {checkout.address ? <strong>Saved</strong> : null}
              </header>
              <div className="form-grid">
                <label className="full">
                  Recipient name
                  <input
                    name="recipientName"
                    autoComplete="shipping name"
                    defaultValue={checkout.address?.recipientName ?? checkout.contact?.name}
                    required
                  />
                </label>
                <label>
                  Mobile number
                  <input
                    name="deliveryPhone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="shipping tel"
                    defaultValue={checkout.address?.phone ?? checkout.contact?.phone}
                    required
                  />
                </label>
                <label>
                  District
                  <input
                    name="district"
                    autoComplete="shipping address-level1"
                    defaultValue={checkout.address?.district}
                  />
                </label>
                <label className="full">
                  Street address
                  <input
                    name="addressLine1"
                    autoComplete="shipping address-line1"
                    defaultValue={checkout.address?.addressLine1}
                    placeholder="House, road, village, or landmark"
                    required
                  />
                </label>
                <label className="full">
                  Apartment / additional details (optional)
                  <input
                    name="addressLine2"
                    autoComplete="shipping address-line2"
                    defaultValue={checkout.address?.addressLine2}
                  />
                </label>
                <label>
                  Area / thana
                  <input
                    name="area"
                    autoComplete="shipping address-level3"
                    defaultValue={checkout.address?.area}
                  />
                </label>
                <label>
                  City
                  <input
                    name="city"
                    autoComplete="shipping address-level2"
                    defaultValue={checkout.address?.city}
                  />
                </label>
                <label>
                  Postcode (optional)
                  <input
                    name="postalCode"
                    inputMode="numeric"
                    autoComplete="shipping postal-code"
                    defaultValue={checkout.address?.postalCode}
                  />
                </label>
                <label>
                  Country
                  <input
                    name="countryCode"
                    autoComplete="shipping country"
                    defaultValue={checkout.address?.countryCode ?? 'BD'}
                    required
                  />
                </label>
              </div>
              <button className="button-secondary" disabled={Boolean(saving)} type="submit">
                {saving === 'address'
                  ? 'Saving…'
                  : checkout.address
                    ? 'Update address'
                    : 'Save address'}
              </button>
            </form>
            <section className="checkout-card">
              <header>
                <span>3</span>
                <div>
                  <h2>Delivery</h2>
                  <p>Available delivery service is confirmed by Maevelle operations.</p>
                </div>
              </header>
              <label className="method-option selected">
                <input type="radio" checked readOnly />
                <span>
                  <strong>Standard delivery</strong>
                  <small>Timing and any charge are confirmed with your order.</small>
                </span>
              </label>
            </section>
            <section className="checkout-card">
              <header>
                <span>4</span>
                <div>
                  <h2>Payment</h2>
                  <p>Choose how you would like to pay.</p>
                </div>
                {selectedMethod ? <strong>Selected</strong> : null}
              </header>
              <div className="payment-options">
                {paymentMethods.map((method) => (
                  <label
                    className={`method-option ${checkout.paymentMethod === method.code ? 'selected' : ''}`}
                    key={method.code}
                  >
                    <input
                      checked={checkout.paymentMethod === method.code}
                      disabled={Boolean(saving)}
                      name="paymentMethod"
                      type="radio"
                      value={method.code}
                      onChange={() => void selectPaymentMethod(method.code)}
                    />
                    <span>
                      <strong>{method.name}</strong>
                      <small>
                        {method.methodType === 'COD'
                          ? 'Pay when your order is delivered.'
                          : (method.instructions.text ??
                            'Place the order, then submit your transaction reference securely.')}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
          <aside className="checkout-summary">
            <h2>Your order</h2>
            <div className="checkout-items">
              {checkout.cart.lines.map((line) => (
                <article key={line.id}>
                  <div>
                    <strong>{line.productTitle}</strong>
                    <span>
                      {line.sku} · Qty {line.quantity}
                    </span>
                  </div>
                  <strong>{money(line.net)}</strong>
                </article>
              ))}
            </div>
            <dl>
              <div>
                <dt>Merchandise</dt>
                <dd>{money(checkout.cart.merchandiseGross)}</dd>
              </div>
              {Number(checkout.cart.discountTotal) > 0 ? (
                <div className="discount">
                  <dt>Discount</dt>
                  <dd>−{money(checkout.cart.discountTotal)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Delivery</dt>
                <dd>Confirmed after order</dd>
              </div>
              <div className="summary-total">
                <dt>Total</dt>
                <dd>{money(checkout.cart.merchandiseNet)}</dd>
              </div>
            </dl>
            {checkout.cart.appliedCoupons.length ? (
              <p className="checkout-promotion">
                Promotion applied: {checkout.cart.appliedCoupons.join(', ')}
              </p>
            ) : null}
            <button
              className="place-order"
              disabled={
                Boolean(saving) || !checkout.contact || !checkout.address || !selectedMethod
              }
              type="button"
              onClick={() => void placeOrder()}
            >
              {saving === 'order'
                ? 'Placing your order…'
                : `Place order · ${money(checkout.cart.merchandiseNet)}`}
            </button>
            <p className="checkout-terms">
              By placing your order, you agree to Maevelle’s{' '}
              <Link href="/policies/terms">terms</Link> and{' '}
              <Link href="/policies/privacy">privacy policy</Link>.
            </p>
            <Link className="continue-link" href="/cart">
              ← Return to your bag
            </Link>
          </aside>
        </div>
      </section>
    </main>
  );
}
