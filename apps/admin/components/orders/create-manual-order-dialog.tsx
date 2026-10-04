'use client';

import { CircleAlert, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type {
  CatalogVariantChoiceDto,
  CreateManualOrderInputDto,
  CustomerDetailDto,
  CustomerSummaryDto,
  OrderDetailDto,
  PaginatedEnvelope,
  PaymentMethodDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

interface EditableLine {
  readonly key: string;
  readonly variantId: string;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly priceOverrideReason: string;
}

function emptyLine(): EditableLine {
  return {
    key: crypto.randomUUID(),
    variantId: '',
    quantity: '1',
    unitPrice: '',
    priceOverrideReason: '',
  };
}

const selectClassName =
  'flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

export function CreateManualOrderDialog({
  initialCustomerId,
}: {
  readonly initialCustomerId?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCustomerId = initialCustomerId ?? searchParams.get('customerId') ?? '';

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [customerMode, setCustomerMode] = useState<'existing' | 'inline'>('existing');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(queryCustomerId);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CustomerDetailDto | null>(null);
  const [isLoadingCustomerDetail, setIsLoadingCustomerDetail] = useState(false);

  // Address inputs state (allows prefill from customer profile + custom override per order snapshot)
  const [recipientName, setRecipientName] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [area, setArea] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [postalCode, setPostalCode] = useState('');

  const [customers, setCustomers] = useState<readonly CustomerSummaryDto[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<readonly PaymentMethodDto[]>([]);
  const [lines, setLines] = useState<readonly EditableLine[]>(() => [emptyLine()]);
  const [isLoading, setIsLoading] = useState(true);

  // Load choices
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [customerPage, locationChoices, variantChoices, methods] = await Promise.all([
          fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
            '/admin/customers?page=1&pageSize=100&status=ACTIVE',
            { signal: controller.signal },
          ),
          fetchApiData<WarehouseLocationDto[]>('/admin/warehouse/locations', {
            signal: controller.signal,
          }),
          fetchApiData<CatalogVariantChoiceDto[]>('/admin/catalog/variants', {
            signal: controller.signal,
          }),
          fetchApiData<PaymentMethodDto[]>('/admin/payments/methods', {
            signal: controller.signal,
          }),
        ]);
        setCustomers(customerPage.items);
        setLocations(locationChoices);
        setVariants(variantChoices.filter((variant) => variant.status === 'ACTIVE'));
        setPaymentMethods(methods.filter((method) => method.status === 'ACTIVE'));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessage(error instanceof Error ? error.message : 'Order choices could not be loaded.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  // Fetch selected customer detail to auto-fill address and detect restrictions
  useEffect(() => {
    if (!selectedCustomerId) {
      setSelectedCustomerDetail(null);
      return;
    }
    const controller = new AbortController();
    async function fetchCustomer() {
      setIsLoadingCustomerDetail(true);
      try {
        const res = await fetchApiData<CustomerDetailDto>(`/admin/customers/${selectedCustomerId}`, {
          signal: controller.signal,
        });
        setSelectedCustomerDetail(res);

        // Pre-fill delivery details from default address or customer profile
        const defAddress = res.addresses?.find((a) => a.isDefault) ?? res.addresses?.[0];
        const primaryPhone =
          res.phones?.find((p) => p.isPrimary)?.phone ??
          res.primaryPhone ??
          res.phones?.[0]?.phone ??
          '';

        setRecipientName(defAddress?.recipientName || res.displayName || '');
        setDeliveryPhone(defAddress?.phone || primaryPhone || '');
        if (defAddress) {
          setAddressLine1(defAddress.addressLine1 || '');
          setAddressLine2(defAddress.addressLine2 || '');
          setArea(defAddress.area || '');
          setCity(defAddress.city || '');
          setDistrict(defAddress.district || '');
          setPostalCode(defAddress.postalCode || '');
        }

        // Ensure customer is present in customers dropdown list
        setCustomers((prev) => {
          if (prev.some((c) => c.id === res.id)) return prev;
          return [res, ...prev];
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) setIsLoadingCustomerDetail(false);
      }
    }
    void fetchCustomer();
    return () => controller.abort();
  }, [selectedCustomerId]);

  function updateLine(key: string, changes: Partial<Omit<EditableLine, 'key'>>) {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...changes } : line)),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || isLoading) return;
    setBusy(true);
    setMessage('');

    const formData = new FormData(event.currentTarget);
    const deliveryOverrideReason = String(formData.get('deliveryOverrideReason') || '').trim();
    const discountAmount = String(formData.get('discountAmount') || '').trim();
    const discountOverrideReason = String(formData.get('discountOverrideReason') || '').trim();

    const payload: CreateManualOrderInputDto = {
      locationId: String(formData.get('locationId')),
      paymentMethod: formData.get('paymentMethod') as CreateManualOrderInputDto['paymentMethod'],
      salesChannel: formData.get('salesChannel') as CreateManualOrderInputDto['salesChannel'],
      ...(customerMode === 'inline'
        ? {
            customer: {
              name: String(formData.get('inlineCustomerName')),
              phone: String(formData.get('inlineCustomerPhone')),
              email: String(formData.get('inlineCustomerEmail')) || undefined,
            },
          }
        : {
            customerId: String(formData.get('customerId')),
          }),
      ...(deliveryOverrideReason
        ? {
            deliveryAmount: String(formData.get('deliveryAmount') || '0'),
            deliveryOverrideReason,
          }
        : {}),
      ...(discountAmount && Number(discountAmount) > 0
        ? {
            discountAmount,
            discountOverrideReason: discountOverrideReason || 'Negotiated order discount',
          }
        : {}),
      lines: lines.map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        ...(line.unitPrice ? { unitPrice: line.unitPrice } : {}),
        ...(line.priceOverrideReason ? { priceOverrideReason: line.priceOverrideReason } : {}),
      })),
      deliveryAddress: {
        recipientName: String(formData.get('recipientName')),
        phone: String(formData.get('phone')),
        addressLine1: String(formData.get('addressLine1')),
        ...(formData.get('addressLine2')
          ? { addressLine2: String(formData.get('addressLine2')) }
          : {}),
        ...(formData.get('area') ? { area: String(formData.get('area')) } : {}),
        ...(formData.get('city') ? { city: String(formData.get('city')) } : {}),
        ...(formData.get('district') ? { district: String(formData.get('district')) } : {}),
        ...(formData.get('postalCode') ? { postalCode: String(formData.get('postalCode')) } : {}),
        countryCode: 'BD',
        saveToCustomer: formData.get('saveToCustomer') === 'on',
      },
    };

    try {
      const order = await fetchApiData<OrderDetailDto>('/admin/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      router.push(`/orders/${order.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be created.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="border-b pb-4">
        <h1 className="text-xl font-semibold tracking-tight">Create manual order</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Capture a phone or social order using the same inventory, payment, and order rules as
          checkout.
        </p>
      </div>

      {message ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          role="alert"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{message}</p>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-7">
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Customer Selection</Label>
              <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setCustomerMode('existing')}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    customerMode === 'existing'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Existing Customer
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerMode('inline')}
                  className={`rounded-md px-3 py-1 font-medium transition-colors ${
                    customerMode === 'inline'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  New / Social Customer
                </button>
              </div>
            </div>

            {customerMode === 'existing' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    id="customerId"
                    name="customerId"
                    required={customerMode === 'existing'}
                    disabled={isLoading || busy}
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className={selectClassName}
                  >
                    <option value="">Select an existing customer</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.displayName} · {customer.primaryPhone ?? customer.customerNumber}
                      </option>
                    ))}
                  </select>
                  {isLoadingCustomerDetail && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
                  )}
                </div>

                {/* Active Restrictions Alert for Selected Customer */}
                {selectedCustomerDetail &&
                  selectedCustomerDetail.restrictions &&
                  selectedCustomerDetail.restrictions.filter((r) => r.status === 'ACTIVE').length > 0 && (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-rose-800 dark:text-rose-300">
                        <ShieldAlert className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>Commercial Restrictions Active on this Customer</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {selectedCustomerDetail.restrictions
                          .filter((r) => r.status === 'ACTIVE')
                          .map((r) => (
                            <span
                              key={r.id}
                              className="rounded bg-rose-200/80 px-2 py-0.5 font-medium text-rose-900 dark:bg-rose-900/50 dark:text-rose-200"
                            >
                              {r.restrictionType.replaceAll('_', ' ')}: {r.reason}
                            </span>
                          ))}
                      </div>
                      <p className="text-[11px] opacity-80">
                        Fulfillment and payment policies will enforce these restrictions at checkout/confirmation.
                      </p>
                    </div>
                  )}

                <p className="text-xs text-muted-foreground">
                  Select an existing customer from the database. Default address and contact details will prefill below.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCustomerName" className="text-xs">Customer Name *</Label>
                  <Input
                    id="inlineCustomerName"
                    name="inlineCustomerName"
                    placeholder="e.g. Ashrafee Ahmed"
                    required={customerMode === 'inline'}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCustomerPhone" className="text-xs">Phone Number *</Label>
                  <Input
                    id="inlineCustomerPhone"
                    name="inlineCustomerPhone"
                    type="tel"
                    placeholder="e.g. 01712345678"
                    required={customerMode === 'inline'}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inlineCustomerEmail" className="text-xs">Email (Optional)</Label>
                  <Input
                    id="inlineCustomerEmail"
                    name="inlineCustomerEmail"
                    type="email"
                    placeholder="e.g. buyer@example.com"
                    className="h-9 text-sm"
                  />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-3">
                  Customer will be automatically linked to an existing profile matching this phone or created new without leaving this screen.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="salesChannel">Sales channel</Label>
            <select
              id="salesChannel"
              name="salesChannel"
              defaultValue="ADMIN"
              className={selectClassName}
            >
              <option value="ADMIN">Admin entry</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="PHONE">Phone</option>
              <option value="EXTERNAL_API">External API</option>
              <option value="IMPORT">Import</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="locationId">Stock location</Label>
            <select
              id="locationId"
              name="locationId"
              required
              disabled={isLoading || busy}
              className={selectClassName}
            >
              <option value="">Select a location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name} ({location.code})
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="space-y-4 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Order items</h2>
              <p className="text-xs text-muted-foreground">
                Leave price blank to use the active Catalog price.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              <Plus aria-hidden="true" /> Add item
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={line.key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-12">
                <div className="space-y-2 sm:col-span-5">
                  <Label htmlFor={`variant-${line.key}`}>Variant {index + 1}</Label>
                  <select
                    id={`variant-${line.key}`}
                    required
                    value={line.variantId}
                    onChange={(event) => updateLine(line.key, { variantId: event.target.value })}
                    className={selectClassName}
                  >
                    <option value="">Select a variant</option>
                    {variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.productTitle} · {variant.optionSummary || variant.sku}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`quantity-${line.key}`}>Quantity</Label>
                  <Input
                    id={`quantity-${line.key}`}
                    inputMode="decimal"
                    required
                    value={line.quantity}
                    onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`price-${line.key}`}>Override price</Label>
                  <Input
                    id={`price-${line.key}`}
                    inputMode="decimal"
                    placeholder="Catalog"
                    value={line.unitPrice}
                    onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={`reason-${line.key}`}>Override reason</Label>
                  <Input
                    id={`reason-${line.key}`}
                    disabled={!line.unitPrice}
                    required={Boolean(line.unitPrice)}
                    value={line.priceOverrideReason}
                    onChange={(event) =>
                      updateLine(line.key, { priceOverrideReason: event.target.value })
                    }
                  />
                </div>
                <div className="flex items-end sm:col-span-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove item ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <h2 className="font-medium">Payment & Pricing Adjustments</h2>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <select id="paymentMethod" name="paymentMethod" required className={selectClassName}>
              <option value="">Select a payment method</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.code}>
                  {method.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            {/* spacer */}
          </div>
          <div className="space-y-2">
            <Label htmlFor="deliveryAmount">Delivery override amount</Label>
            <Input
              id="deliveryAmount"
              name="deliveryAmount"
              inputMode="decimal"
              defaultValue="0"
            />
            <p className="text-xs text-muted-foreground">Leave the reason blank to use the configured delivery rate.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="deliveryOverrideReason">Delivery override reason</Label>
            <Input id="deliveryOverrideReason" name="deliveryOverrideReason" placeholder="Required to override the configured rate" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discountAmount">Negotiated order discount (BDT)</Label>
            <Input
              id="discountAmount"
              name="discountAmount"
              inputMode="decimal"
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">Order-level commercial discount agreed with buyer.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="discountOverrideReason">Discount reason</Label>
            <Input id="discountOverrideReason" name="discountOverrideReason" placeholder="E.g., Social media campaign, VIP buyer agreement" />
          </div>
        </section>

        <section className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1">
            <h2 className="font-medium">Delivery address</h2>
            <p className="text-xs text-muted-foreground">
              Pre-filled from customer profile when selected. Can be adjusted per order without altering historical records.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="recipientName">Recipient name</Label>
            <Input
              id="recipientName"
              name="recipientName"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Delivery phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              required
              value={deliveryPhone}
              onChange={(e) => setDeliveryPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="addressLine1">Address line 1</Label>
            <Input
              id="addressLine1"
              name="addressLine1"
              required
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input
              id="addressLine2"
              name="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="area">Area</Label>
            <Input
              id="area"
              name="area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="district">District</Label>
            <Input
              id="district"
              name="district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal code</Label>
            <Input
              id="postalCode"
              name="postalCode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
            />
          </div>
          <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
            <input type="checkbox" name="saveToCustomer" className="size-4" />
            <span className="text-sm">Save this address to the customer profile</span>
          </label>
        </section>

        <div className="flex flex-col-reverse gap-2 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || isLoading}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Create order
          </Button>
        </div>
      </form>
    </div>
  );
}
