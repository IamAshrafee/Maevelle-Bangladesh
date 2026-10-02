'use client';

import { useState } from 'react';
import {
  Ban,
  ShieldAlert,
  Search,
  Plus,
  RotateCw,
  Copy,
  Check,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  type EmailSuppressionDto,
  formatDateTime,
  fetchEmailApi,
} from './email-types';

interface EmailSuppressionsTabProps {
  readonly suppressions: readonly EmailSuppressionDto[];
  readonly onRefresh: () => void;
}

const reasonExplanations: Record<string, { label: string; desc: string; severity: 'high' | 'medium' | 'info' }> = {
  HARD_BOUNCE: {
    label: 'Hard Bounce',
    desc: "The recipient's mail server permanently rejected the address as non-existent or invalid.",
    severity: 'high',
  },
  COMPLAINT: {
    label: 'Spam Complaint',
    desc: 'The recipient actively reported this email as spam in their email client. Clearing may severely hurt sender reputation.',
    severity: 'high',
  },
  ADMINISTRATOR: {
    label: 'Administrator Block',
    desc: 'Manually suppressed by an operator or team member for operational or legal reasons.',
    severity: 'medium',
  },
  PROVIDER: {
    label: 'Provider Suppression',
    desc: 'Flagged and suppressed directly by Resend or delivery network bounce rules.',
    severity: 'medium',
  },
};

export function EmailSuppressionsTab({ suppressions, onRefresh }: EmailSuppressionsTabProps) {
  const [search, setSearch] = useState('');
  const [filterReason, setFilterReason] = useState('');
  const [filterActive, setFilterActive] = useState('active');
  const [selectedToClear, setSelectedToClear] = useState<EmailSuppressionDto | null>(null);
  const [clearReason, setClearReason] = useState('Customer confirmed email address is valid and requested delivery resumption');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('Customer requested to be unsubscribed from all transactional emails');
  const [submitting, setSubmitting] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const copyEmail = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleClear = async () => {
    if (!selectedToClear) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi('/admin/email/suppressions', {
        method: 'POST',
        body: JSON.stringify({
          email: selectedToClear.normalized_email,
          active: false,
          reason: clearReason.trim(),
        }),
      });
      setMessage(`Suppression cleared for ${selectedToClear.normalized_email}. Outbound delivery may now resume.`);
      setSelectedToClear(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear suppression.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddSuppression = async () => {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi('/admin/email/suppressions', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          active: true,
          reason: newReason.trim(),
        }),
      });
      setMessage(`Address ${newEmail.trim()} has been proactively suppressed.`);
      setAddDialogOpen(false);
      setNewEmail('');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add suppression.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = suppressions.filter((s) => {
    if (filterActive === 'active' && !s.active) return false;
    if (filterActive === 'cleared' && s.active) return false;
    if (filterReason && s.reason !== filterReason) return false;
    if (search.trim() && !s.normalized_email.toLowerCase().includes(search.toLowerCase().trim())) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Informational Guidance Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-rose-500/30 bg-rose-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-rose-800 dark:text-rose-300">
              <Ban className="size-4 shrink-0" /> Hard Bounces
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {reasonExplanations['HARD_BOUNCE']?.desc ?? 'The recipient mail server permanently rejected the message.'}
          </CardContent>
        </Card>

        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-purple-800 dark:text-purple-300">
              <ShieldAlert className="size-4 shrink-0" /> Spam Complaints
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {reasonExplanations['COMPLAINT']?.desc ?? 'The recipient marked this email as spam.'}
          </CardContent>
        </Card>

        <Card className="border-muted">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <Info className="size-4 shrink-0" /> Reputation Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Suppressed addresses protect Maevelle from mailbox provider blacklisting and maintain 99%+ deliverability.
          </CardContent>
        </Card>
      </div>

      {message ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {/* Main Table Card */}
      <Card>
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base">Suppression Registry ({filtered.length})</CardTitle>
              <CardDescription className="text-xs">
                Email addresses excluded from automated and manual transactional delivery
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} className="h-8 text-xs">
                <Plus className="mr-1.5 size-3.5" /> Suppress Address
              </Button>
              <Button size="sm" variant="ghost" onClick={onRefresh} className="h-8 text-xs">
                <RotateCw className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 pt-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search suppressed email addresses…"
                className="h-9 pl-8 text-xs"
              />
            </div>

            <select
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden"
              aria-label="Filter active suppressions"
            >
              <option value="active">Active Blocks Only</option>
              <option value="cleared">Cleared Historical Blocks</option>
              <option value="all">All Suppressions</option>
            </select>

            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden"
              aria-label="Filter by suppression reason"
            >
              <option value="">All Reasons</option>
              <option value="HARD_BOUNCE">Hard Bounce</option>
              <option value="COMPLAINT">Spam Complaint</option>
              <option value="ADMINISTRATOR">Administrator Block</option>
              <option value="PROVIDER">Provider Block</option>
            </select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-xs">
              <thead className="border-b bg-muted/40 text-left text-muted-foreground font-medium">
                <tr>
                  <th className="p-3 pl-4">Email Address</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Origin / Source</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Logged Date</th>
                  <th className="p-3 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 pl-4 font-mono font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span>{item.normalized_email}</span>
                        <button
                          type="button"
                          onClick={() => copyEmail(item.normalized_email)}
                          className="hover:text-primary transition-colors"
                          title="Copy email address"
                        >
                          {copiedEmail === item.normalized_email ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant={
                          item.reason === 'COMPLAINT'
                            ? 'destructive'
                            : item.reason === 'HARD_BOUNCE'
                            ? 'outline'
                            : 'secondary'
                        }
                        className="text-[10px]"
                      >
                        {reasonExplanations[item.reason]?.label || item.reason}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground capitalize">
                      {item.source} {item.provider ? `(${item.provider})` : ''}
                    </td>
                    <td className="p-3">
                      {item.active ? (
                        <span className="inline-flex items-center gap-1 text-destructive font-medium">
                          <Ban className="size-3" /> Active Block
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                          <CheckCircle2 className="size-3 text-emerald-600" /> Cleared
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(item.created_at)}
                      {item.cleared_at ? (
                        <p className="text-[10px] text-muted-foreground">
                          Cleared: {formatDateTime(item.cleared_at)}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3 pr-4 text-right whitespace-nowrap">
                      {item.active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSelectedToClear(item)}
                        >
                          Clear Block
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic">
                          {item.clear_reason ? `Reason: ${item.clear_reason}` : 'Cleared'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
              <CheckCircle2 className="mb-2 size-8 text-emerald-600 opacity-60" />
              <p className="font-semibold text-sm text-foreground">No matching email suppressions</p>
              <p className="mt-1 text-xs max-w-sm">
                {search || filterReason
                  ? 'No suppressed email matches your current search filters.'
                  : 'Great news! No customer email addresses are currently suppressed in this organization.'}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Clear Suppression Dialog */}
      <Dialog open={Boolean(selectedToClear)} onOpenChange={(open) => !open && setSelectedToClear(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clear Recipient Suppression</DialogTitle>
            <DialogDescription>
              Clearing a suppression will re-allow automated transactional emails to be dispatched to this address.
            </DialogDescription>
          </DialogHeader>
          {selectedToClear ? (
            <div className="space-y-4 py-2 text-sm">
              {selectedToClear.reason === 'COMPLAINT' ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="size-4" /> Warning: Spam Complaint
                  </div>
                  <p>
                    This recipient actively flagged Maevelle as spam. Resending without explicit, written customer confirmation may cause Resend or Gmail/Yahoo to degrade domain deliverability.
                  </p>
                </div>
              ) : null}

              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p><strong>Target Email:</strong> <code className="font-mono">{selectedToClear.normalized_email}</code></p>
                <p><strong>Original Reason:</strong> {selectedToClear.reason}</p>
                <p><strong>First Blocked:</strong> {formatDateTime(selectedToClear.created_at)}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clear-suppression-reason">Operational Justification (Audited)</Label>
                <Input
                  id="clear-suppression-reason"
                  value={clearReason}
                  onChange={(e) => setClearReason(e.target.value)}
                  placeholder="Why is this block being removed?"
                  className="text-xs"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedToClear(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleClear} disabled={submitting || !clearReason.trim()}>
              {submitting ? 'Clearing…' : 'Confirm & Unblock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Manual Suppression Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manually Suppress Email Address</DialogTitle>
            <DialogDescription>
              Proactively prevent future automated transactional emails from reaching this customer address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label htmlFor="manual-suppress-email">Email Address</Label>
              <Input
                id="manual-suppress-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="customer@example.com"
                className="text-xs font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-suppress-reason">Reason for Suppression</Label>
              <Input
                id="manual-suppress-reason"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Why should this recipient be blocked?"
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAddSuppression} disabled={submitting || !newEmail.trim() || !newReason.trim()}>
              {submitting ? 'Suppressing…' : 'Add to Suppression List'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
