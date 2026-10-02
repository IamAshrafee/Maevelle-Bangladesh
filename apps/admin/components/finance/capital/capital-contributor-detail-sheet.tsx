'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpFromLine,
  ExternalLink,
  HandCoins,
  PencilLine,
  Plus,
  RotateCcw,
  ShieldCheck,
  User,
} from 'lucide-react';
import type {
  CapitalContributorDto,
  CapitalEventDto,
  PaginatedResultDto,
} from '@maevelle/contracts';
import { OperationalEmptyState } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchApiData } from '@/lib/api';
import { formatFinanceDate, formatMoney, humanizeFinanceCode } from '@/lib/finance/types';
import { signedMoney } from './types';

export interface CapitalContributorDetailSheetProps {
  readonly contributor?: CapitalContributorDto | undefined;
  readonly defaultCurrency: string;
  readonly open: boolean;
  readonly canManage: boolean;
  readonly onClose: () => void;
  readonly onEditContributor: (contributor: CapitalContributorDto) => void;
  readonly onRecordContribution: (contributorId: string) => void;
  readonly onRecordPersonalPayment: (contributorId: string) => void;
  readonly onRecordWithdrawal: (contributorId: string) => void;
  readonly onOpenTransaction: (eventId: string) => void;
  readonly onReverse: (event: CapitalEventDto) => void;
}

const emptyPagination = { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 };

export function CapitalContributorDetailSheet({
  contributor,
  defaultCurrency,
  open,
  canManage,
  onClose,
  onEditContributor,
  onRecordContribution,
  onRecordPersonalPayment,
  onRecordWithdrawal,
  onOpenTransaction,
  onReverse,
}: CapitalContributorDetailSheetProps) {
  const [events, setEvents] = useState<readonly CapitalEventDto[]>([]);
  const [pagination, setPagination] = useState(emptyPagination);
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState<'ALL' | CapitalEventDto['eventType']>('ALL');
  const [loading, setLoading] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!contributor?.id || !open) return;
    setLoading(true);
    try {
      const typeParam = eventTypeFilter === 'ALL' ? '' : `&eventType=${eventTypeFilter}`;
      const result = await fetchApiData<PaginatedResultDto<CapitalEventDto>>(
        `/admin/finance/capital/events?contributorId=${contributor.id}&page=${page}&pageSize=15${typeParam}`,
      );
      setEvents(result.items);
      setPagination(result.pagination);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [contributor?.id, eventTypeFilter, open, page]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  if (!contributor) return null;

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent className="flex flex-col w-full sm:max-w-2xl overflow-y-auto p-0">
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">{contributor.displayName}</span>
                <StatusBadge status={contributor.status} />
              </div>
              <SheetTitle className="sr-only">Contributor Details</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                {contributor.contactNote || 'Permanent capital contributor'}
              </SheetDescription>
            </div>
            {canManage ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs shrink-0"
                onClick={() => onEditContributor(contributor)}
              >
                <PencilLine className="size-3.5" />
                <span>Edit</span>
              </Button>
            ) : null}
          </div>

          {/* Linked Team Member Pill */}
          {contributor.linkedUserId ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary shrink-0" />
              <span>
                Linked team member:{' '}
                <strong className="text-foreground">
                  {contributor.linkedUserName || 'Team Account'}
                </strong>
                {contributor.linkedUserEmail ? ` (${contributor.linkedUserEmail})` : ''}
              </span>
              <Link href="/team" className="ml-auto text-primary hover:underline flex items-center gap-0.5">
                <span>View team</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="size-3.5" />
              <span>External contributor (not linked to an internal user account)</span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 px-6 py-5 space-y-6">
          {/* Contributor Financial Summary Stats */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Financial position
            </h4>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-card p-3">
                <span className="text-[11px] text-muted-foreground block">Contributed cash</span>
                <strong className="text-sm sm:text-base font-bold text-foreground mt-0.5 block tabular-nums">
                  {formatMoney(contributor.grossContributed, defaultCurrency)}
                </strong>
                <span className="text-[10px] text-muted-foreground block mt-1">Direct account deposits</span>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <span className="text-[11px] text-muted-foreground block">Personally funded</span>
                <strong className="text-sm sm:text-base font-bold text-foreground mt-0.5 block tabular-nums">
                  {formatMoney(contributor.ownerFundedExpenses, defaultCurrency)}
                </strong>
                <span className="text-[10px] text-muted-foreground block mt-1">Paid outside accounts</span>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <span className="text-[11px] text-muted-foreground block">Withdrawn</span>
                <strong className="text-sm sm:text-base font-bold text-foreground mt-0.5 block tabular-nums">
                  {formatMoney(contributor.withdrawn, defaultCurrency)}
                </strong>
                <span className="text-[10px] text-muted-foreground block mt-1">Returned capital</span>
              </div>
              <div className="rounded-xl border bg-primary/5 border-primary/20 p-3">
                <span className="text-[11px] font-medium text-primary block">Net capital</span>
                <strong className="text-sm sm:text-base font-bold text-primary mt-0.5 block tabular-nums">
                  {formatMoney(contributor.netCapital, defaultCurrency)}
                </strong>
                <span className="text-[10px] text-muted-foreground block mt-1">Authoritative position</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          {canManage && contributor.status === 'ACTIVE' ? (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => onRecordContribution(contributor.id)}
              >
                <Plus className="size-3.5" />
                <span>Add contribution</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => onRecordPersonalPayment(contributor.id)}
              >
                <HandCoins className="size-3.5 text-emerald-600" />
                <span>Personal payment</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => onRecordWithdrawal(contributor.id)}
              >
                <ArrowUpFromLine className="size-3.5 text-rose-600" />
                <span>Withdraw capital</span>
              </Button>
            </div>
          ) : null}

          {/* Contributor Ledger */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contributor ledger ({pagination.totalItems})
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Complete append-only financial history for {contributor.displayName}
                </p>
              </div>

              {/* Event Type Filter */}
              <NativeSelect
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventTypeFilter(e.target.value as typeof eventTypeFilter);
                  setPage(1);
                }}
                className="h-8 text-xs w-[170px]"
                aria-label="Filter events by activity type"
              >
                <option value="ALL">All activities</option>
                <option value="CONTRIBUTION">Capital contributions</option>
                <option value="OWNER_FUNDED_EXPENSE">Personally funded costs</option>
                <option value="WITHDRAWAL">Capital withdrawals</option>
                <option value="REVERSAL">Reversals & corrections</option>
              </NativeSelect>
            </div>

            {loading ? (
              <div className="space-y-2 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : events.length === 0 ? (
              <OperationalEmptyState
                title="No transactions for this contributor"
                description="Contributions, personal payments, and withdrawals for this contributor will appear here."
              />
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Activity</TableHead>
                        <TableHead className="text-xs">Connection</TableHead>
                        <TableHead className="text-xs">Trx #</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        <TableHead className="text-xs text-right" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((event) => {
                        const isNeg = Number(event.amountDelta) < 0;
                        return (
                          <TableRow
                            key={event.id}
                            className="cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => onOpenTransaction(event.id)}
                          >
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatFinanceDate(event.occurredAt, false)}
                            </TableCell>
                            <TableCell className="text-xs">
                              <StatusBadge status={humanizeFinanceCode(event.eventType)} />
                              {event.isReversed ? (
                                <Badge variant="destructive" className="ml-1 text-[9px] px-1 py-0">
                                  Reversed
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs font-medium max-w-[140px] truncate">
                              {event.accountName ? (
                                <span className="text-foreground">{event.accountName}</span>
                              ) : event.expenseNumber ? (
                                <span className="text-foreground">{event.expenseNumber}</span>
                              ) : event.purchaseNumber ? (
                                <span className="text-foreground">{event.purchaseNumber}</span>
                              ) : (
                                <span className="text-muted-foreground">Direct record</span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {event.transactionNumber}
                            </TableCell>
                            <TableCell
                              className={`text-right text-xs font-semibold tabular-nums ${
                                isNeg ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {signedMoney(event.amountDelta, event.currencyCode || defaultCurrency, formatMoney)}
                            </TableCell>
                            <TableCell className="text-right">
                              {canManage && !event.isReversed && event.eventType !== 'REVERSAL' ? (
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onReverse(event);
                                  }}
                                >
                                  <RotateCcw className="size-3" />
                                  <span>Reverse</span>
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 ? (
                  <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={page >= pagination.totalPages || loading}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t bg-muted/10 p-4">
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
