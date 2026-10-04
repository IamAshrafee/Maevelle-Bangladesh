'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  User,
} from 'lucide-react';
import Link from 'next/link';

import type { OrderDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { CorrectCustomerContactDialog } from './correct-customer-contact-dialog';
import { CorrectDeliveryAddressDialog } from './correct-delivery-address-dialog';

interface OrderCustomerAddressCardProps {
  readonly order: OrderDetailDto;
  readonly onUpdated: () => void;
}

export function OrderCustomerAddressCard({
  order,
  onUpdated,
}: OrderCustomerAddressCardProps) {
  const [copiedPhone, setCopiedPhone] = useState(false);

  function copyPhone(phone: string) {
    void navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  const { customer, address, capabilities } = order;

  return (
    <div className="space-y-6">
      {/* Customer Info Card */}
      <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Profile">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <User className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Customer</h2>
          </div>
          {capabilities.canEditCustomerContact && (
            <CorrectCustomerContactDialog order={order} onCompleted={onUpdated} />
          )}
        </div>

        <div className="space-y-3 px-6 py-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground">Full Name</span>
            <div className="font-semibold text-foreground">
              {order.customerId ? (
                <Link
                  href={`/customers/${order.customerId}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {customer.displayName || 'Unnamed Customer'}
                  <ExternalLink className="size-3 opacity-70" />
                </Link>
              ) : (
                customer.displayName || 'Guest Customer'
              )}
            </div>
          </div>

          <div>
            <span className="text-xs text-muted-foreground">Phone Number</span>
            <div className="flex items-center gap-2 font-medium text-foreground">
              <a href={`tel:${customer.phone}`} className="hover:underline flex items-center gap-1">
                <Phone className="size-3.5 text-muted-foreground" />
                {customer.phone}
              </a>
              <button
                type="button"
                onClick={() => copyPhone(customer.phone)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                title="Copy phone number"
              >
                {copiedPhone ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            </div>
          </div>

          {customer.email && (
            <div>
              <span className="text-xs text-muted-foreground">Email Address</span>
              <div className="text-foreground">
                <a
                  href={`mailto:${customer.email}`}
                  className="hover:underline flex items-center gap-1 text-primary"
                >
                  <Mail className="size-3.5 text-muted-foreground" />
                  {customer.email}
                </a>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Delivery Address Card */}
      <section className="rounded-xl border bg-card shadow-sm" aria-label="Delivery Address">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold text-foreground">Delivery Address</h2>
          </div>
          {capabilities.canEditAddress && (
            <CorrectDeliveryAddressDialog order={order} onCompleted={onUpdated} />
          )}
        </div>

        <address className="space-y-1.5 px-6 py-4 text-sm not-italic">
          <p className="font-semibold text-foreground">{address.recipientName}</p>
          <p className="text-muted-foreground">{address.phone}</p>
          <p className="text-foreground">{address.addressLine1}</p>
          {address.addressLine2 && <p className="text-foreground">{address.addressLine2}</p>}
          <p className="text-muted-foreground text-xs">
            {[address.area, address.city, address.district, address.postalCode, address.countryCode]
              .filter(Boolean)
              .join(', ')}
          </p>
        </address>
      </section>
    </div>
  );
}
