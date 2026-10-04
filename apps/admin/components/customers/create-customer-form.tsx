'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, ExternalLink, Loader2, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import type { CustomerSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

export function CreateCustomerForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  // Form fields
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showAddressSection, setShowAddressSection] = useState(false);

  // Duplicate candidate matching state
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState<readonly CustomerSummaryDto[]>([]);

  useEffect(() => {
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const query = trimmedPhone.length >= 10 ? trimmedPhone : trimmedEmail.length >= 5 ? trimmedEmail : '';

    if (!query) {
      setDuplicateMatches([]);
      setCheckingDuplicates(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setCheckingDuplicates(true);
        const res = await fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
          `/admin/customers?q=${encodeURIComponent(query)}&pageSize=3`,
          { signal: controller.signal },
        );
        setDuplicateMatches(res.items ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        if (!controller.signal.aborted) setCheckingDuplicates(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [phone, email]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const displayName = (formData.get('displayName') as string)?.trim();
    const phoneVal = (formData.get('phone') as string)?.trim() || undefined;
    const emailVal = (formData.get('email') as string)?.trim() || undefined;
    const source = formData.get('source') as string;

    const addressLine1 = (formData.get('addressLine1') as string)?.trim();
    const addressLine2 = (formData.get('addressLine2') as string)?.trim();
    const area = (formData.get('area') as string)?.trim();
    const city = (formData.get('city') as string)?.trim();
    const district = (formData.get('district') as string)?.trim();
    const postalCode = (formData.get('postalCode') as string)?.trim();

    try {
      const data = await fetchApiData<{ id: string }>('/admin/customers', {
        method: 'POST',
        body: JSON.stringify({
          displayName,
          phone: phoneVal,
          email: emailVal,
          source,
        }),
      });

      // If initial address was provided, add it
      if (addressLine1) {
        try {
          await fetchApiData(`/admin/customers/${data.id}/addresses`, {
            method: 'POST',
            body: JSON.stringify({
              recipientName: displayName,
              phone: phoneVal,
              addressLine1,
              addressLine2: addressLine2 || undefined,
              area: area || undefined,
              city: city || undefined,
              district: district || undefined,
              postalCode: postalCode || undefined,
              countryCode: 'BD',
              isDefault: true,
              label: 'Primary Delivery Address',
            }),
          });
        } catch {
          // Address creation failure shouldn't block customer redirection
        }
      }

      router.push(`/customers/${data.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Customer could not be created.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="displayName">Customer / Display Name *</Label>
          <Input
            id="displayName"
            name="displayName"
            required
            disabled={busy}
            placeholder="e.g. Tanzim Rahman"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              disabled={busy}
              placeholder="e.g. 01712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              disabled={busy}
              placeholder="e.g. buyer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {/* Live Duplicate Suggestion Banner */}
        {checkingDuplicates && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Search className="size-3.5 animate-spin" />
            <span>Checking existing records...</span>
          </div>
        )}

        {duplicateMatches.length > 0 && !checkingDuplicates && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200 space-y-2">
            <div className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="space-y-1">
                <p className="font-semibold">
                  Existing customer profile matches this contact information:
                </p>
                {duplicateMatches.map((match) => (
                  <div key={match.id} className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="font-medium text-foreground">{match.displayName}</span>
                    <span className="font-mono text-[11px] opacity-75">{match.customerNumber}</span>
                    <span className="opacity-75">
                      ({match.primaryPhone ?? match.primaryEmail ?? 'No contact'} · {match.orderCount} orders)
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[11px] border-amber-400 bg-white hover:bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-white"
                      render={<Link href={`/customers/${match.id}`} target="_blank" />}
                      nativeButton={false}
                    >
                      Open Profile <ExternalLink className="ml-1 size-2.5" />
                    </Button>
                  </div>
                ))}
                <p className="text-[11px] opacity-75 pt-1">
                  You can proceed to create a separate profile if this is a distinct customer, or open the existing record.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="source">Acquisition Source</Label>
          <select
            id="source"
            name="source"
            defaultValue="ADMIN_CREATED"
            disabled={busy}
            className="flex min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ADMIN_CREATED">Admin Created (Manual Entry)</option>
            <option value="FACEBOOK">Facebook Campaign / Inbox</option>
            <option value="INSTAGRAM">Instagram Direct Message</option>
            <option value="WHATSAPP">WhatsApp Conversation</option>
            <option value="PHONE">Phone Call / Hotline</option>
            <option value="IMPORT">CSV / Database Import</option>
            <option value="EXTERNAL_API">External Partner API</option>
          </select>
        </div>

        {/* Optional Initial Address Section */}
        <div className="pt-2">
          {!showAddressSection ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowAddressSection(true)}
              className="text-xs"
            >
              <MapPin className="mr-1.5 size-3.5" /> Add Initial Address (Optional)
            </Button>
          ) : (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-primary" /> Initial Delivery Address
                </h4>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAddressSection(false)}
                  className="h-6 text-[11px]"
                >
                  Remove Address
                </Button>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="addressLine1" className="text-xs">Address Line 1 *</Label>
                  <Input
                    id="addressLine1"
                    name="addressLine1"
                    placeholder="e.g. House 14, Road 5, Block C"
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="addressLine2" className="text-xs">Address Line 2 (Optional)</Label>
                  <Input
                    id="addressLine2"
                    name="addressLine2"
                    placeholder="e.g. Flat 4B"
                    disabled={busy}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="area" className="text-xs">Area / Thana</Label>
                    <Input id="area" name="area" placeholder="e.g. Banani" disabled={busy} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city" className="text-xs">City</Label>
                    <Input id="city" name="city" placeholder="e.g. Dhaka" disabled={busy} />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="district" className="text-xs">District</Label>
                    <Input id="district" name="district" placeholder="e.g. Dhaka" disabled={busy} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode" className="text-xs">Postal Code</Label>
                    <Input id="postalCode" name="postalCode" placeholder="e.g. 1213" disabled={busy} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {message ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0 opacity-80" />
          <p className="leading-tight">{message}</p>
        </div>
      ) : null}

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => router.push('/customers')}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Create Customer
        </Button>
      </div>
    </form>
  );
}
