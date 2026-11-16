'use client';

import { useState } from 'react';
import { CheckCircle, Link2, Link2Off, Loader2, UserCheck } from 'lucide-react';
import type { CustomerAccountDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAdminCapability } from '@/components/admin-capabilities';
import { fetchApiData } from '@/lib/api';

interface CustomerAccountCardProps {
  readonly customerId: string;
  readonly account?: CustomerAccountDto | null | undefined;
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerAccountCard({
  customerId,
  account,
  isReadOnly = false,
  onUpdated,
}: CustomerAccountCardProps) {
  const canManage = useAdminCapability('customers.manage') && !isReadOnly;

  // Unlink Dialog
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinkReason, setUnlinkReason] = useState('');
  const [unlinkBusy, setUnlinkBusy] = useState(false);
  const [unlinkError, setUnlinkError] = useState('');

  // Link Dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [linkType, setLinkType] = useState('MANUAL_CLAIM');
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState('');

  const isLinked = account && account.status === 'ACTIVE';

  async function handleUnlink(e: React.FormEvent) {
    e.preventDefault();
    if (!unlinkReason.trim() || unlinkBusy) return;
    setUnlinkBusy(true);
    setUnlinkError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/account/unlink`, {
        method: 'POST',
        body: JSON.stringify({ reason: unlinkReason.trim() }),
      });
      setUnlinkOpen(false);
      setUnlinkReason('');
      onUpdated();
    } catch (err) {
      setUnlinkError(err instanceof Error ? err.message : 'Could not unlink account.');
    } finally {
      setUnlinkBusy(false);
    }
  }

  async function handleLink(e: React.FormEvent) {
    e.preventDefault();
    if (!userId.trim() || linkBusy) return;
    setLinkBusy(true);
    setLinkError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/account/link`, {
        method: 'POST',
        body: JSON.stringify({
          userId: userId.trim(),
          linkType,
        }),
      });
      setLinkOpen(false);
      setUserId('');
      onUpdated();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not link account.');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Account Linkage">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <UserCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">User Account Link</h2>
        </div>
        {isLinked ? (
          <Badge
            variant="outline"
            className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] font-semibold gap-1"
          >
            <CheckCircle className="size-2.5" /> Account Linked
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground text-[10px]">
            No Account Linked
          </Badge>
        )}
      </div>

      <div className="p-6">
        {isLinked ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">
                  {account.user?.name ?? 'Authenticated User'}
                </span>
                <span className="font-mono text-muted-foreground">{account.userId}</span>
              </div>
              <p className="text-muted-foreground">Email: {account.user?.email ?? '—'}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="secondary" className="text-[10px]">
                  Method: {account.linkType.replaceAll('_', ' ')}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Linked on{' '}
                  {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                    new Date(account.verifiedAt),
                  )}
                </span>
              </div>
            </div>

            {canManage && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-rose-700 hover:text-rose-800 gap-1"
                  onClick={() => setUnlinkOpen(true)}
                >
                  <Link2Off className="size-3" /> Unlink Account
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This profile currently operates as a verified guest identity. All past and future
              guest orders are retained continuously. When the customer completes storefront
              registration, their historical data will bind to their authenticated account.
            </p>

            {canManage && (
              <div className="pt-1 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1"
                  onClick={() => setLinkOpen(true)}
                >
                  <Link2 className="size-3" /> Manually Link Account...
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Unlink Dialog */}
      <Dialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unlink Customer Account</DialogTitle>
            <DialogDescription>
              Sever the association between this customer profile and the authenticated login user.
              Existing orders and contacts remain with this customer profile.
            </DialogDescription>
          </DialogHeader>
          {unlinkError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              {unlinkError}
            </div>
          )}
          <form onSubmit={handleUnlink} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="unlink-reason">Reason for Unlinking *</Label>
              <Input
                id="unlink-reason"
                value={unlinkReason}
                onChange={(e) => setUnlinkReason(e.target.value)}
                placeholder="e.g. Account claimed erroneously by third party."
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnlinkOpen(false)}
                disabled={unlinkBusy}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={unlinkBusy || !unlinkReason.trim()}
              >
                {unlinkBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Unlink Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Link Customer Account Sheet */}
      <Sheet open={linkOpen} onOpenChange={setLinkOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>Link Customer Account</SheetTitle>
            <SheetDescription>
              Associate this customer profile with an existing authenticated IAM user record.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={handleLink} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {linkError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
                  {linkError}
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="link-user-id">IAM User ID *</Label>
                <Input
                  id="link-user-id"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="UUID of iam.users record"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="link-type">Linkage Method</Label>
                <NativeSelect
                  id="link-type"
                  value={linkType}
                  onChange={(e) => setLinkType(e.target.value)}
                >
                  <NativeSelectOption value="MANUAL_CLAIM">Manual Operator Claim</NativeSelectOption>
                  <NativeSelectOption value="VERIFIED_PHONE">Verified Phone Link</NativeSelectOption>
                  <NativeSelectOption value="VERIFIED_EMAIL">Verified Email Link</NativeSelectOption>
                  <NativeSelectOption value="INVITATION">Merchant Invitation</NativeSelectOption>
                  <NativeSelectOption value="GUEST_CONVERSION">Guest Checkout Conversion</NativeSelectOption>
                </NativeSelect>
              </div>
            </div>
            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLinkOpen(false)}
                disabled={linkBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={linkBusy || !userId.trim()}>
                {linkBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                Link Account
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
}
