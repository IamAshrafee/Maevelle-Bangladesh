'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  ExternalLink,
  Mail,
  MessageSquare,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { CustomerCommunicationSummaryDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchApiData } from '@/lib/api';

interface CustomerCommunicationSectionProps {
  readonly customerId: string;
}

export function CustomerCommunicationSection({
  customerId,
}: CustomerCommunicationSectionProps) {
  const [communications, setCommunications] = useState<readonly CustomerCommunicationSummaryDto[]>([]);
  const [channel, setChannel] = useState<'ALL' | 'EMAIL' | 'SMS'>('ALL');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Inspector Dialog
  const [inspectTarget, setInspectTarget] =
    useState<CustomerCommunicationSummaryDto | null>(null);

  async function loadCommunications(selectedChannel: 'ALL' | 'EMAIL' | 'SMS', pageNum: number, append = false) {
    setLoading(true);
    try {
      const channelParam = selectedChannel === 'ALL' ? '' : `&channel=${selectedChannel}`;
      const res = await fetchApiData<{ items: readonly CustomerCommunicationSummaryDto[]; totalCount: number }>(
        `/admin/customers/${customerId}/communications?page=${pageNum}&pageSize=20${channelParam}`,
      );
      setCommunications((prev) => (append ? [...prev, ...res.items] : res.items));
      setTotalCount(res.totalCount);
    } catch {
      // Handled silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPage(1);
    void loadCommunications(channel, 1, false);
  }, [customerId, channel]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    void loadCommunications(channel, nextPage, true);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'DELIVERED':
        return (
          <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] gap-1">
            <CheckCircle2 className="size-2.5" /> Delivered
          </Badge>
        );
      case 'SENT':
        return (
          <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-800 text-[10px] gap-1">
            <Clock className="size-2.5" /> Sent
          </Badge>
        );
      case 'FAILED':
        return (
          <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-800 text-[10px] gap-1">
            <XCircle className="size-2.5" /> Failed
          </Badge>
        );
      case 'SKIPPED':
        return (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 text-[10px] gap-1">
            <AlertCircle className="size-2.5" /> Skipped
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-[10px] capitalize">
            {status.toLowerCase()}
          </Badge>
        );
    }
  }

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Communications">
      <div className="flex flex-col gap-3 border-b px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Communication History</h2>
          <p className="text-xs text-muted-foreground">
            Authoritative log of SMS notifications, order emails, and OTP dispatches sent to this customer.
          </p>
        </div>

        {/* Channel Filters */}
        <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => setChannel('ALL')}
            className={`px-3 py-1 rounded-md transition-colors ${
              channel === 'ALL'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All Channels
          </button>
          <button
            type="button"
            onClick={() => setChannel('EMAIL')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
              channel === 'EMAIL'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mail className="size-3" /> Email
          </button>
          <button
            type="button"
            onClick={() => setChannel('SMS')}
            className={`flex items-center gap-1 px-3 py-1 rounded-md transition-colors ${
              channel === 'SMS'
                ? 'bg-background text-foreground shadow-2xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="size-3" /> SMS
          </button>
        </div>
      </div>

      <div className="divide-y">
        {loading && communications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            <RefreshCw className="mr-2 inline size-4 animate-spin" /> Loading communications...
          </div>
        ) : communications.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center text-muted-foreground">
            <MessageSquare className="mb-2 size-8 opacity-20" aria-hidden="true" />
            <p className="text-sm font-medium">No communications recorded</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automated notifications sent by the system or staff will appear here.
            </p>
          </div>
        ) : (
          communications.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-muted/20 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {item.channel === 'EMAIL' ? (
                    <Mail className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                  ) : (
                    <MessageSquare className="size-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                  )}
                  <span className="font-semibold text-foreground truncate">
                    {item.renderedSubject || item.notificationType.replaceAll('_', ' ')}
                  </span>
                  {getStatusBadge(item.status)}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span>To: {item.effectiveRecipient || item.intendedRecipient || '—'}</span>
                  {item.provider && <span>via {item.provider}</span>}
                  <span>
                    {new Intl.DateTimeFormat('en-BD', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(item.sentAt || item.createdAt))}
                  </span>
                  {item.sourceDomain === 'orders' && item.sourceId && (
                    <Link
                      href={`/orders/${item.sourceId}`}
                      className="text-primary hover:underline inline-flex items-center gap-0.5 font-medium"
                    >
                      Related Order <ExternalLink className="size-2.5" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => setInspectTarget(item)}
                >
                  <Eye className="size-3" /> Preview
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {communications.length < totalCount && (
        <div className="flex justify-center border-t p-3">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={loadMore}
            className="text-xs"
          >
            {loading ? 'Loading...' : `Load More (${communications.length} of ${totalCount})`}
          </Button>
        </div>
      )}

      {/* Message Inspection Dialog */}
      <Dialog open={Boolean(inspectTarget)} onOpenChange={(open) => !open && setInspectTarget(null)}>
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {inspectTarget?.channel === 'EMAIL' ? (
                <Mail className="size-4 text-primary" />
              ) : (
                <MessageSquare className="size-4 text-emerald-600" />
              )}
              {inspectTarget?.renderedSubject || inspectTarget?.notificationType.replaceAll('_', ' ')}
            </DialogTitle>
            <DialogDescription>
              Dispatched to {inspectTarget?.effectiveRecipient || inspectTarget?.intendedRecipient} on{' '}
              {inspectTarget?.sentAt
                ? new Intl.DateTimeFormat('en-BD', {
                    dateStyle: 'long',
                    timeStyle: 'medium',
                  }).format(new Date(inspectTarget.sentAt))
                : 'Pending dispatch'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 text-xs">
            <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 font-mono text-[11px]">
              <p>Type: {inspectTarget?.notificationType}</p>
              <p>Status: {inspectTarget?.status}</p>
              {inspectTarget?.provider && <p>Provider: {inspectTarget.provider}</p>}
              {inspectTarget?.smsDetails && (
                <p>
                  Encoding: {inspectTarget.smsDetails.encoding} · Segments:{' '}
                  {inspectTarget.smsDetails.estimatedSegments} ({inspectTarget.smsDetails.characterCount} chars)
                </p>
              )}
              {inspectTarget?.failureMessage && (
                <p className="text-rose-700 font-sans font-medium">
                  Failure: {inspectTarget.failureMessage}
                </p>
              )}
              {inspectTarget?.skipReason && (
                <p className="text-amber-800 font-sans font-medium">
                  Skip Reason: {inspectTarget.skipReason}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-foreground">Rendered Body</span>
              <div className="rounded-lg border bg-card p-4 whitespace-pre-wrap font-sans text-xs leading-relaxed text-foreground">
                {inspectTarget?.renderedBody}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
