'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Filter,
  RotateCw,
  Eye,
  Send,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmailStatusBadge } from './email-status-badge';
import {
  type EmailNotificationRowDto,
  formatDateTime,
  eventDisplayLabels,
} from './email-types';

interface EmailActivityTabProps {
  readonly emails: readonly EmailNotificationRowDto[];
  readonly totalItems: number;
  readonly page: number;
  readonly pageSize: number;
  readonly statusFilter: string;
  readonly eventFilter: string;
  readonly triggerFilter: string;
  readonly searchQuery: string;
  readonly loading: boolean;
  readonly onSearchChange: (search: string) => void;
  readonly onStatusFilterChange: (status: string) => void;
  readonly onEventFilterChange: (event: string) => void;
  readonly onTriggerFilterChange: (trigger: string) => void;
  readonly onPageChange: (page: number) => void;
  readonly onInspectEmail: (email: EmailNotificationRowDto) => void;
  readonly onRefresh: () => void;
}

export function EmailActivityTab({
  emails,
  totalItems,
  page,
  pageSize,
  statusFilter,
  eventFilter,
  triggerFilter,
  searchQuery,
  loading,
  onSearchChange,
  onStatusFilterChange,
  onEventFilterChange,
  onTriggerFilterChange,
  onPageChange,
  onInspectEmail,
  onRefresh,
}: EmailActivityTabProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearchChange(localSearch.trim());
  };

  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Email Activity & Lifecycle</CardTitle>
            <CardDescription className="text-xs">
              Complete chronological transactional email stream with provider message IDs and status tracking
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading} className="h-8 text-xs">
              <RotateCw className={`mr-1.5 size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 pt-2">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Search by recipient email, order ID, or provider ID…"
              className="h-9 pl-9 text-xs"
            />
          </form>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            aria-label="Filter by delivery status"
          >
            <option value="">All Statuses</option>
            <option value="DELIVERED">Delivered</option>
            <option value="SENT">Accepted by Resend</option>
            <option value="QUEUED">Queued</option>
            <option value="PROCESSING">Processing</option>
            <option value="FAILED">Failed</option>
            <option value="BOUNCED">Bounced</option>
            <option value="COMPLAINED">Spam Complaint</option>
            <option value="SUPPRESSED">Suppressed</option>
            <option value="PENDING_MANUAL">Pending Manual</option>
            <option value="SKIPPED_NO_EMAIL">Skipped (No Email)</option>
          </select>

          {/* Event Filter */}
          <select
            value={eventFilter}
            onChange={(e) => onEventFilterChange(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            aria-label="Filter by business event"
          >
            <option value="">All Business Events</option>
            <option value="ORDER_PLACED">Order Received</option>
            <option value="ORDER_CONFIRMED">Order Confirmed</option>
            <option value="PAYMENT_VERIFIED">Payment Confirmed</option>
            <option value="ORDER_DISPATCHED">Order Shipped</option>
            <option value="DELIVERY_COMPLETED">Order Delivered</option>
            <option value="ORDER_CANCELLED">Order Cancelled</option>
            <option value="REFUND_COMPLETED">Refund Completed</option>
          </select>

          {/* Trigger Type Filter */}
          <select
            value={triggerFilter}
            onChange={(e) => onTriggerFilterChange(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
            aria-label="Filter by trigger origin"
          >
            <option value="">All Triggers</option>
            <option value="AUTOMATIC">Automatic Event</option>
            <option value="MANUAL">Manual Admin Send</option>
            <option value="TEST">Safe Test Send</option>
            <option value="RESEND">Customer Resend</option>
          </select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="border-b bg-muted/40 text-left text-muted-foreground font-medium">
              <tr>
                <th className="p-3 pl-4">Created</th>
                <th className="p-3">Event / Template</th>
                <th className="p-3">Recipient</th>
                <th className="p-3">Status</th>
                <th className="p-3">Trigger</th>
                <th className="p-3">Provider Message ID</th>
                <th className="p-3 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emails.map((row) => {
                const isRedirected =
                  row.effective_recipient &&
                  row.intended_recipient &&
                  row.effective_recipient.toLowerCase() !== row.intended_recipient.toLowerCase();

                return (
                  <tr
                    key={row.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer group"
                    onClick={() => onInspectEmail(row)}
                  >
                    <td className="p-3 pl-4 whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-foreground">
                          {eventDisplayLabels[row.notification_type] || row.notification_type}
                        </span>
                        {row.template_version ? (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                            v{row.template_version}
                          </Badge>
                        ) : null}
                      </div>
                      {row.rendered_subject ? (
                        <p className="text-[11px] text-muted-foreground truncate max-w-[260px]">
                          {row.rendered_subject}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-foreground font-medium">
                          {row.intended_recipient || row.skip_reason || 'No email on file'}
                        </span>
                        {isRedirected ? (
                          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                            ↳ Redirected to: {row.effective_recipient}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <EmailStatusBadge status={row.status} />
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      <Badge
                        variant={
                          row.trigger_type === 'TEST'
                            ? 'outline'
                            : row.trigger_type === 'MANUAL'
                            ? 'secondary'
                            : 'default'
                        }
                        className="text-[10px] font-mono uppercase"
                      >
                        {row.trigger_type}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono text-muted-foreground truncate max-w-[150px]">
                      {row.provider_message_id || '—'}
                    </td>
                    <td className="p-3 pr-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => onInspectEmail(row)}
                        >
                          <Eye className="size-3.5 mr-1" /> Inspect
                        </Button>
                        {row.source_domain === 'orders.order' && row.source_id ? (
                          <Link
                            href={`/orders/${row.source_id}`}
                            className="inline-flex items-center justify-center rounded-md h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                            title="Open Order"
                          >
                            <ExternalLink className="size-3" />
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty States */}
        {emails.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Filter className="mb-2 size-8 opacity-20" aria-hidden="true" />
            <p className="font-semibold text-sm text-foreground">No matching email notifications found</p>
            <p className="mt-1 text-xs max-w-sm">
              {searchQuery || statusFilter || eventFilter || triggerFilter
                ? 'Try clearing active search terms or status filters to view historical records.'
                : 'Transactional emails will appear here as orders, payments, and fulfillments trigger customer communications.'}
            </p>
          </div>
        ) : null}

        {/* Pagination Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3 pl-4 pr-4 bg-muted/10 text-xs text-muted-foreground">
          <div>
            Showing <strong>{emails.length > 0 ? (page - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong>{Math.min(page * pageSize, totalItems)}</strong> of <strong>{totalItems}</strong> notifications
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="mr-1 size-3.5" /> Previous
            </Button>
            <span className="px-2 font-medium">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next <ChevronRight className="ml-1 size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
