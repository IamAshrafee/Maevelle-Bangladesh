'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, CreditCard, Lock, ShieldCheck } from 'lucide-react';
import type { ApiEnvelope } from '@maevelle/contracts';
import './checkout.css';

// ... (interfaces and helpers)
interface Checkout {
  version: number;
  status: string;
  paymentMethod: 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';
  calculationVersion: number;
  calculationFingerprint: string;
  cart: {
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

function money(value: string): string {
  return `৳${value}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout>();
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethod[]>([]);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // Simple step management
  const [editingContact, setEditingContact] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);

  const load = async () => {
    try {
      let response = await fetch('/api/storefront/v1/checkouts/current', { credentials: 'include' });
      if (response.status === 404) {
        response = await fetch('/api/storefront/v1/checkouts', {
          method: 'POST',
          credentials: 'include',
        });
      }
      if (response.ok) {
        const current = ((await response.json()) as ApiEnvelope<Checkout>).data;
        setCheckout(current);
        setEditingContact(current.contact === null);
        setEditingAddress(current.address === null);
        
        const methods = await fetch('/api/storefront/v1/checkouts/current/payment-methods', {
          credentials: 'include',
        });
        if (methods.ok) setPaymentMethods(((await methods.json()) as ApiEnvelope<readonly PaymentMethod[]>).data);
      }
    } catch (e) {
      // Mock data for preview
      setCheckout({
        version: 1,
        status: 'OPEN',
        paymentMethod: 'COD',
        calculationVersion: 1,
        calculationFingerprint: 'xyz',
        contact: null,
        address: null,
        cart: {
          merchandiseGross: '900.00',
          discountTotal: '0.00',
          merchandiseNet: '900.00',
          appliedCoupons: [],
          lines: [{ id: '1', productTitle: 'Structured Wool Coat', sku: 'COAT-BLK-S', quantity: '1', unitPrice: '450.00', gross: '450.00', discount: '0.00', net: '450.00', availability: 'IN_STOCK' }]
        }
      });
      setPaymentMethods([
        { code: 'COD', name: 'Cash on Delivery', methodType: 'COD', instructions: { text: 'Pay with cash upon delivery.' } },
        { code: 'BKASH_MANUAL', name: 'bKash', methodType: 'MOBILE_WALLET', instructions: { text: 'Send payment to our merchant number.' } }
      ]);
      setEditingContact(true);
      setEditingAddress(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  async function onContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCheckout(prev => prev ? {
      ...prev,
      contact: {
        name: data.get('name') as string,
        phone: data.get('phone') as string,
        email: (data.get('email') as string) || undefined
      }
    } : prev);
    setEditingContact(false);
    if (checkout?.address === null) setEditingAddress(true);
  }

  async function onAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setCheckout(prev => prev ? {
      ...prev,
      address: {
        recipientName: data.get('recipientName') as string,
        phone: data.get('deliveryPhone') as string,
        addressLine1: data.get('addressLine1') as string,
        countryCode: 'BD'
      }
    } : prev);
    setEditingAddress(false);
  }

  async function selectPaymentMethod(paymentMethod: Checkout['paymentMethod']) {
    if (!checkout || saving || checkout.paymentMethod === paymentMethod) return;
    setCheckout({ ...checkout, paymentMethod });
  }

  async function placeOrder() {
    if (!checkout || saving) return;
    setSaving(true);
    setMessage('Processing your order...');
    setTimeout(() => {
      // Mock success for demo
      router.push('/orders/confirmation');
    }, 1500);
  }

  if (loading) return <main className="container"><p>Loading checkout...</p></main>;
  if (!checkout) return <main className="container"><p>Unable to load checkout.</p></main>;

  const canPlaceOrder = checkout.contact !== null && checkout.address !== null && checkout.paymentMethod !== null;

  return (
    <main className="checkout-main container animate-fade-in">
      <header className="checkout-header">
        <Link href="/" className="brand">MAEVELLE</Link>
        <h1 className="checkout-title mt-4">Checkout</h1>
      </header>

      <div className="checkout-layout">
        <div className="checkout-forms">
          
          {/* Step 1: Contact */}
          <section className="checkout-section">
            <div className="section-header">
              <span className="step-number">{checkout.contact && !editingContact ? <Check size={14} /> : '1'}</span>
              <h2>Contact Information</h2>
            </div>
            
            {editingContact || !checkout.contact ? (
              <form onSubmit={onContact} className="form-grid">
                <div className="form-field full-width">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" required defaultValue={checkout.contact?.email} />
                </div>
                <div className="form-field">
                  <label htmlFor="name">Full Name</label>
                  <input id="name" name="name" required defaultValue={checkout.contact?.name} />
                </div>
                <div className="form-field">
                  <label htmlFor="phone">Phone Number</label>
                  <input id="phone" name="phone" required defaultValue={checkout.contact?.phone} />
                </div>
                <div className="form-actions full-width">
                  <button type="submit" className="btn-primary">Continue to Delivery</button>
                </div>
              </form>
            ) : (
              <div className="saved-data">
                <p>{checkout.contact.email}</p>
                <p>{checkout.contact.name}</p>
                <p>{checkout.contact.phone}</p>
                <button type="button" className="edit-btn" onClick={() => setEditingContact(true)}>Edit</button>
              </div>
            )}
          </section>

          {/* Step 2: Delivery */}
          <section className="checkout-section">
            <div className="section-header">
              <span className="step-number">{checkout.address && !editingAddress ? <Check size={14} /> : '2'}</span>
              <h2>Delivery Address</h2>
            </div>
            
            {checkout.contact && !editingContact ? (
              editingAddress || !checkout.address ? (
                <form onSubmit={onAddress} className="form-grid">
                  <div className="form-field full-width">
                    <label htmlFor="recipientName">Recipient Name</label>
                    <input id="recipientName" name="recipientName" required defaultValue={checkout.contact?.name || ''} />
                  </div>
                  <div className="form-field full-width">
                    <label htmlFor="addressLine1">Address Line 1</label>
                    <input id="addressLine1" name="addressLine1" required defaultValue={checkout.address?.addressLine1} />
                  </div>
                  <div className="form-field full-width">
                    <label htmlFor="deliveryPhone">Delivery Phone</label>
                    <input id="deliveryPhone" name="deliveryPhone" required defaultValue={checkout.contact?.phone || ''} />
                  </div>
                  <div className="form-actions full-width">
                    <button type="submit" className="btn-primary">Continue to Payment</button>
                  </div>
                </form>
              ) : (
                <div className="saved-data">
                  <p>{checkout.address.recipientName}</p>
                  <p>{checkout.address.addressLine1}</p>
                  <p>{checkout.address.phone}</p>
                  <button type="button" className="edit-btn" onClick={() => setEditingAddress(true)}>Edit</button>
                </div>
              )
            ) : (
              <p className="text-secondary">Complete contact information to proceed.</p>
            )}
          </section>

          {/* Step 3: Payment */}
          <section className="checkout-section">
            <div className="section-header">
              <span className="step-number">3</span>
              <h2>Payment Method</h2>
            </div>
            
            {checkout.address && !editingAddress ? (
              <div className="payment-methods">
                <div className="flex items-center gap-2 mb-4 text-sm text-slate-500">
                  <Lock size={14} /> <span>All transactions are secure and encrypted.</span>
                </div>
                
                {paymentMethods.map((pm) => (
                  <div 
                    key={pm.code} 
                    className={`payment-method-card ${checkout.paymentMethod === pm.code ? 'selected' : ''}`}
                    onClick={() => selectPaymentMethod(pm.code)}
                  >
                    <div className="payment-header">
                      <div className="radio-circle"></div>
                      <span className="payment-name">{pm.name}</span>
                    </div>
                    {checkout.paymentMethod === pm.code && pm.instructions.text && (
                      <div className="payment-details">
                        {pm.instructions.text}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-secondary">Complete delivery information to proceed.</p>
            )}
          </section>
        </div>

        {/* Order Summary */}
        <div className="checkout-summary">
          <h2 className="summary-title">Order Summary</h2>
          
          <div className="summary-items">
            {checkout.cart.lines.map(line => (
              <div key={line.id} className="summary-item">
                <div className="summary-item-info">
                  <div>
                    <div className="summary-item-title">{line.productTitle}</div>
                    <div className="summary-item-qty">Qty: {line.quantity}</div>
                  </div>
                </div>
                <div className="summary-item-price">{money(line.net)}</div>
              </div>
            ))}
          </div>

          <div className="summary-row">
            <span>Subtotal</span>
            <span>{money(checkout.cart.merchandiseGross)}</span>
          </div>
          
          {checkout.cart.discountTotal !== '0.00' && (
            <div className="summary-row text-accent-blue">
              <span>Discount</span>
              <span>-{money(checkout.cart.discountTotal)}</span>
            </div>
          )}
          
          <div className="summary-row">
            <span>Shipping</span>
            <span>Free</span>
          </div>

          <div className="summary-total">
            <span>Total</span>
            <span>{money(checkout.cart.merchandiseNet)}</span>
          </div>

          <button 
            type="button" 
            className="place-order-btn"
            disabled={!canPlaceOrder || saving}
            onClick={placeOrder}
          >
            {saving ? 'Processing...' : (
              <>
                <ShieldCheck size={20} />
                Place Order
              </>
            )}
          </button>
          
          {message && <div className="status-message">{message}</div>}
        </div>
      </div>
    </main>
  );
}
