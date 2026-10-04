'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  MapPin,
  Star,
} from 'lucide-react';
import type { CustomerAddressDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { AddAddressDialog } from './add-address-dialog';
import { EditAddressDialog } from './edit-address-dialog';
import { fetchApiData } from '@/lib/api';

interface CustomerAddressesSectionProps {
  readonly customerId: string;
  readonly addresses: readonly CustomerAddressDto[];
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerAddressesSection({
  customerId,
  addresses,
  isReadOnly = false,
  onUpdated,
}: CustomerAddressesSectionProps) {
  const canManage = useAdminCapability('customers.manage') && !isReadOnly;
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function formatFullAddress(a: CustomerAddressDto): string {
    const parts = [
      a.recipientName,
      a.phone,
      a.addressLine1,
      a.addressLine2,
      a.area,
      a.city,
      a.district,
      a.postalCode,
      a.countryCode,
    ].filter(Boolean);
    return parts.join(', ');
  }

  function copyAddress(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleSetDefault(addressId: string) {
    try {
      await fetchApiData(`/admin/customers/${customerId}/addresses/${addressId}/default`, {
        method: 'POST',
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not set default address.');
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Address Book">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Address Book</h2>
          <p className="text-xs text-muted-foreground">
            Saved delivery addresses for future checkout. Old order snapshots remain unchanged.
          </p>
        </div>
        {canManage && (
          <AddAddressDialog
            customerId={customerId}
            onAdded={onUpdated}
            isFirstAddress={addresses.length === 0}
          />
        )}
      </div>

      <div className="p-6">
        {addresses.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
            <MapPin className="mb-2 size-8 opacity-20" aria-hidden="true" />
            <p className="text-sm font-medium">No saved addresses</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Addresses used in checkout or added by staff will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {addresses.map((address) => {
              const fullText = formatFullAddress(address);
              return (
                <div
                  key={address.id}
                  className={`relative flex flex-col justify-between rounded-lg border p-4 transition-colors ${
                    address.isDefault ? 'border-primary/40 bg-primary/5' : 'bg-card'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm text-foreground">
                          {address.recipientName}
                        </span>
                        {address.label && (
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                            {address.label}
                          </Badge>
                        )}
                      </div>

                      {address.isDefault && (
                        <Badge
                          variant="outline"
                          className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 px-1.5 font-medium gap-1"
                        >
                          <Star className="size-2.5 fill-primary" /> Default
                        </Badge>
                      )}
                    </div>

                    {address.phone && (
                      <p className="text-xs text-muted-foreground font-mono">{address.phone}</p>
                    )}

                    <div className="text-xs text-muted-foreground leading-relaxed">
                      <p className="text-foreground font-medium">{address.addressLine1}</p>
                      {address.addressLine2 && <p>{address.addressLine2}</p>}
                      <p>
                        {[address.area, address.city, address.district, address.postalCode]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => copyAddress(address.id, fullText)}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground rounded p-1"
                        title="Copy full address"
                      >
                        {copiedId === address.id ? (
                          <>
                            <Check className="size-3 text-emerald-600" />
                            <span className="text-emerald-700 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      {!address.isDefault && canManage && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(address.id)}
                          className="text-[11px] text-muted-foreground hover:text-primary px-1.5 py-0.5"
                        >
                          Set default
                        </button>
                      )}
                    </div>

                    {canManage && (
                      <EditAddressDialog
                        customerId={customerId}
                        address={address}
                        onUpdated={onUpdated}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
