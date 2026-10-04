'use client';

import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Mail,
  MoreVertical,
  Phone,
  PhoneCall,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { CustomerEmailDto, CustomerPhoneDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAdminCapability } from '@/components/admin-capabilities';
import { fetchApiData } from '@/lib/api';

interface CustomerContactSectionProps {
  readonly customerId: string;
  readonly phones: readonly CustomerPhoneDto[];
  readonly emails: readonly CustomerEmailDto[];
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerContactSection({
  customerId,
  phones,
  emails,
  isReadOnly = false,
  onUpdated,
}: CustomerContactSectionProps) {
  const canManage = useAdminCapability('customers.manage') && !isReadOnly;

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Add Phone Dialog
  const [addPhoneOpen, setAddPhoneOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneIsPrimary, setPhoneIsPrimary] = useState(phones.length === 0);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Add Email Dialog
  const [addEmailOpen, setAddEmailOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailIsPrimary, setEmailIsPrimary] = useState(emails.length === 0);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');

  // Verify Dialog (Phone or Email)
  const [verifyTarget, setVerifyTarget] = useState<{
    type: 'phone' | 'email';
    id: string;
    value: string;
  } | null>(null);
  const [verifySource, setVerifySource] = useState('OPERATOR_CONFIRMED');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  function copyText(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleAddPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!phoneInput.trim() || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/phones`, {
        method: 'POST',
        body: JSON.stringify({
          phone: phoneInput.trim(),
          isPrimary: phoneIsPrimary,
        }),
      });
      setAddPhoneOpen(false);
      setPhoneInput('');
      onUpdated();
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Could not add phone number.');
    } finally {
      setPhoneBusy(false);
    }
  }

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim() || emailBusy) return;
    setEmailBusy(true);
    setEmailError('');
    try {
      await fetchApiData(`/admin/customers/${customerId}/emails`, {
        method: 'POST',
        body: JSON.stringify({
          email: emailInput.trim(),
          isPrimary: emailIsPrimary,
        }),
      });
      setAddEmailOpen(false);
      setEmailInput('');
      onUpdated();
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Could not add email address.');
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleSetPrimaryPhone(phoneId: string) {
    try {
      await fetchApiData(`/admin/customers/${customerId}/phones/${phoneId}/primary`, {
        method: 'POST',
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not set primary phone.');
    }
  }

  async function handleSetPrimaryEmail(emailId: string) {
    try {
      await fetchApiData(`/admin/customers/${customerId}/emails/${emailId}/primary`, {
        method: 'POST',
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not set primary email.');
    }
  }

  async function handleDeletePhone(phoneId: string) {
    if (!confirm('Are you sure you want to remove this phone number?')) return;
    try {
      await fetchApiData(`/admin/customers/${customerId}/phones/${phoneId}`, {
        method: 'DELETE',
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove phone number.');
    }
  }

  async function handleDeleteEmail(emailId: string) {
    if (!confirm('Are you sure you want to remove this email address?')) return;
    try {
      await fetchApiData(`/admin/customers/${customerId}/emails/${emailId}`, {
        method: 'DELETE',
      });
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not remove email address.');
    }
  }

  async function handleVerifySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTarget || verifyBusy) return;
    setVerifyBusy(true);
    setVerifyError('');
    try {
      const endpoint =
        verifyTarget.type === 'phone'
          ? `/admin/customers/${customerId}/phones/${verifyTarget.id}/verify`
          : `/admin/customers/${customerId}/emails/${verifyTarget.id}/verify`;
      await fetchApiData(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          verificationSource: verifySource,
        }),
      });
      setVerifyTarget(null);
      onUpdated();
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Could not verify contact.');
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Contacts">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Contact Points</h2>
          <p className="text-xs text-muted-foreground">
            Verified phones and emails used for identity matching and communications.
          </p>
        </div>
      </div>

      <div className="divide-y p-0">
        {/* Phone Numbers Sub-block */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Phone className="size-3.5 text-primary" aria-hidden="true" /> Phone Numbers (
              {phones.length})
            </span>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                onClick={() => {
                  setPhoneIsPrimary(phones.length === 0);
                  setAddPhoneOpen(true);
                }}
              >
                <Plus className="size-3" aria-hidden="true" /> Add Phone
              </Button>
            )}
          </div>

          {phones.length === 0 ? (
            <p className="text-xs italic text-muted-foreground py-2">No phone numbers on file.</p>
          ) : (
            <ul className="space-y-2">
              {phones.map((p) => {
                const isVerified = p.verificationStatus === 'VERIFIED';
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{p.phone}</span>

                      {p.isPrimary && (
                        <Badge
                          variant="outline"
                          className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 px-1.5 font-medium"
                        >
                          Primary
                        </Badge>
                      )}

                      {isVerified ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                          title={p.verificationSource ? `Verified via ${p.verificationSource}` : 'Verified contact'}
                        >
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Unverified</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Copy */}
                      <button
                        type="button"
                        onClick={() => copyText(p.id, p.phone)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Copy phone"
                      >
                        {copiedId === p.id ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>

                      {/* Direct Call Link */}
                      <a
                        href={`tel:${p.phone}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Call phone"
                      >
                        <PhoneCall className="size-3.5" />
                      </a>

                      {/* Dropdown Options */}
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="size-3.5" />
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="text-xs">
                            {!p.isPrimary && (
                              <DropdownMenuItem onClick={() => handleSetPrimaryPhone(p.id)}>
                                Set as Primary Phone
                              </DropdownMenuItem>
                            )}
                            {!isVerified && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setVerifyTarget({
                                    type: 'phone',
                                    id: p.id,
                                    value: p.phone,
                                  })
                                }
                              >
                                <ShieldCheck className="mr-1.5 size-3.5 text-emerald-600" />
                                Verify Phone...
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600"
                              onClick={() => handleDeletePhone(p.id)}
                            >
                              <Trash2 className="mr-1.5 size-3.5" />
                              Remove Phone
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Email Addresses Sub-block */}
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Mail className="size-3.5 text-primary" aria-hidden="true" /> Email Addresses (
              {emails.length})
            </span>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2 gap-1 text-primary hover:text-primary"
                onClick={() => {
                  setEmailIsPrimary(emails.length === 0);
                  setAddEmailOpen(true);
                }}
              >
                <Plus className="size-3" aria-hidden="true" /> Add Email
              </Button>
            )}
          </div>

          {emails.length === 0 ? (
            <p className="text-xs italic text-muted-foreground py-2">No email address on file.</p>
          ) : (
            <ul className="space-y-2">
              {emails.map((e) => {
                const isVerified = e.verificationStatus === 'VERIFIED';
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{e.email}</span>

                      {e.isPrimary && (
                        <Badge
                          variant="outline"
                          className="bg-primary/10 text-primary border-primary/20 text-[10px] py-0 px-1.5 font-medium"
                        >
                          Primary
                        </Badge>
                      )}

                      {isVerified ? (
                        <span
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400"
                          title={e.verificationSource ? `Verified via ${e.verificationSource}` : 'Verified contact'}
                        >
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          Verified
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Unverified</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Copy */}
                      <button
                        type="button"
                        onClick={() => copyText(e.id, e.email)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Copy email"
                      >
                        {copiedId === e.id ? (
                          <Check className="size-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>

                      {/* Direct Mailto Link */}
                      <a
                        href={`mailto:${e.email}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                        title="Send email"
                      >
                        <Mail className="size-3.5" />
                      </a>

                      {/* Dropdown Options */}
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <MoreVertical className="size-3.5" />
                              </button>
                            }
                          />
                          <DropdownMenuContent align="end" className="text-xs">
                            {!e.isPrimary && (
                              <DropdownMenuItem onClick={() => handleSetPrimaryEmail(e.id)}>
                                Set as Primary Email
                              </DropdownMenuItem>
                            )}
                            {!isVerified && (
                              <DropdownMenuItem
                                onClick={() =>
                                  setVerifyTarget({
                                    type: 'email',
                                    id: e.id,
                                    value: e.email,
                                  })
                                }
                              >
                                <ShieldCheck className="mr-1.5 size-3.5 text-emerald-600" />
                                Verify Email...
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600"
                              onClick={() => handleDeleteEmail(e.id)}
                            >
                              <Trash2 className="mr-1.5 size-3.5" />
                              Remove Email
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Add Phone Dialog */}
      <Dialog open={addPhoneOpen} onOpenChange={setAddPhoneOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer Phone</DialogTitle>
            <DialogDescription>
              Record an additional phone number for this customer. Bangladeshi numbers (01...) will be
              automatically normalized.
            </DialogDescription>
          </DialogHeader>
          {phoneError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              {phoneError}
            </div>
          )}
          <form onSubmit={handleAddPhone} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-phone">Phone Number</Label>
              <Input
                id="new-phone"
                type="tel"
                placeholder="01712345678"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="phone-primary-check"
                checked={phoneIsPrimary}
                onChange={(e) => setPhoneIsPrimary(e.target.checked)}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="phone-primary-check" className="text-xs font-normal">
                Set as Primary Phone for this customer
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddPhoneOpen(false)}
                disabled={phoneBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={phoneBusy || !phoneInput.trim()}>
                {phoneBusy ? 'Adding...' : 'Add Phone'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Email Dialog */}
      <Dialog open={addEmailOpen} onOpenChange={setAddEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer Email</DialogTitle>
            <DialogDescription>
              Record an additional email address for order notifications and identity resolution.
            </DialogDescription>
          </DialogHeader>
          {emailError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              {emailError}
            </div>
          )}
          <form onSubmit={handleAddEmail} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">Email Address</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="customer@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="email-primary-check"
                checked={emailIsPrimary}
                onChange={(e) => setEmailIsPrimary(e.target.checked)}
                className="size-4 rounded border-input"
              />
              <Label htmlFor="email-primary-check" className="text-xs font-normal">
                Set as Primary Email for this customer
              </Label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddEmailOpen(false)}
                disabled={emailBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={emailBusy || !emailInput.trim()}>
                {emailBusy ? 'Adding...' : 'Add Email'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Verify Dialog */}
      <Dialog open={Boolean(verifyTarget)} onOpenChange={(open) => !open && setVerifyTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Verify {verifyTarget?.type === 'phone' ? 'Phone Number' : 'Email Address'}
            </DialogTitle>
            <DialogDescription>
              Confirm authoritative verification for{' '}
              <span className="font-semibold text-foreground">{verifyTarget?.value}</span>.
            </DialogDescription>
          </DialogHeader>
          {verifyError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
              {verifyError}
            </div>
          )}
          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verify-source">Verification Source / Method</Label>
              <select
                id="verify-source"
                value={verifySource}
                onChange={(e) => setVerifySource(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                <option value="OPERATOR_CONFIRMED">Operator Phone Call Confirmed</option>
                <option value="WHATSAPP_CONFIRMED">WhatsApp Confirmed</option>
                <option value="ORDER_DELIVERED">Confirmed via Completed Order Delivery</option>
                <option value="MANUAL_AUDIT">Manual Merchant Audit</option>
              </select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVerifyTarget(null)}
                disabled={verifyBusy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={verifyBusy}>
                {verifyBusy ? 'Verifying...' : 'Confirm Verification'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
