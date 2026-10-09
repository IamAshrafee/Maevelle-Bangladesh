'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Filter,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PagePanel, EmptyState } from '@/components/ui/page-shell';
import type {
  IntegrityCheckDto,
  IntegrityFindingListItemDto,
} from '@/lib/integrity/types';

interface FindingsTabProps {
  findings: readonly IntegrityFindingListItemDto[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  loading: boolean;
  checks: readonly IntegrityCheckDto[];
  filters: {
    status: string;
    severity: string;
    module: string;
    checkId: string;
    repairableOnly: boolean;
    q: string;
  };
  onFilterChange: (key: string, value: any) => void;
  onPageChange: (page: number) => void;
  onResetFilters: () => void;
  onOpenFinding: (finding: IntegrityFindingListItemDto) => void;
}

export function FindingsTab({
  findings,
  totalItems,
  totalPages,
  currentPage,
  loading,
  checks,
  filters,
  onFilterChange,
  onPageChange,
  onResetFilters,
  onOpenFinding,
}: FindingsTabProps) {
  // Extract unique modules from checks
  const modules = React.useMemo(() => {
    const set = new Set(checks.map((c) => c.module));
    return Array.from(set).sort();
  }, [checks]);

  // Helper to resolve entity destination link
  const getEntityLink = (entityType: string | null, entityId: string | null) => {
    if (!entityType || !entityId) return null;
    switch (entityType.toLowerCase()) {
      case 'orders.order':
        return { href: `/orders?order=${entityId}`, label: `Order ${entityId.slice(0, 8)}…` };
      case 'orders.order_line':
        return { href: `/orders`, label: `Order Line ${entityId.slice(0, 8)}…` };
      case 'customers.customer':
        return { href: `/customers?customer=${entityId}`, label: `Customer ${entityId.slice(0, 8)}…` };
      case 'catalog.product':
        return { href: `/products?product=${entityId}`, label: `Product ${entityId.slice(0, 8)}…` };
      case 'delivery.delivery':
        return { href: `/deliveries?delivery=${entityId}`, label: `Delivery ${entityId.slice(0, 8)}…` };
      case 'reviews.review':
        return { href: `/reviews?review=${entityId}`, label: `Review ${entityId.slice(0, 8)}…` };
      case 'assets.asset':
        return { href: `/assets`, label: `Asset ${entityId.slice(0, 8)}…` };
      case 'media.asset':
        return { href: `/media`, label: `Media Asset` };
      default:
        return { href: null, label: `${entityType}: ${entityId.slice(0, 8)}…` };
    }
  };

  const hasActiveFilters =
    filters.status !== 'ALL' ||
    filters.severity !== 'ALL' ||
    filters.module !== 'ALL' ||
    filters.checkId !== 'ALL' ||
    filters.repairableOnly ||
    Boolean(filters.q.trim());

  return (
    <div className="space-y-4">
      {/* 1. Filter and Search Controls */}
      <PagePanel className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={filters.q}
              onChange={(e) => onFilterChange('q', e.target.value)}
              placeholder="Search by summary, code, or entity reference…"
              className="pl-9 h-9"
            />
            {filters.q && (
              <button
                type="button"
                onClick={() => onFilterChange('q', '')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Quick Filter Selects */}
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={filters.severity}
              onChange={(e) => onFilterChange('severity', e.target.value)}
              className="h-9 text-xs w-32"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="ERROR">Error</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </NativeSelect>

            <NativeSelect
              value={filters.status}
              onChange={(e) => onFilterChange('status', e.target.value)}
              className="h-9 text-xs w-36"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="INVESTIGATING">Investigating</option>
              <option value="REPAIR_PENDING">Repair Pending</option>
              <option value="REPAIRING">Repairing</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="RESOLVED">Resolved</option>
            </NativeSelect>

            <NativeSelect
              value={filters.module}
              onChange={(e) => onFilterChange('module', e.target.value)}
              className="h-9 text-xs w-32"
            >
              <option value="ALL">All Modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onResetFilters}
                className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Quick Filter Pills Row */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-muted-foreground font-medium mr-1 flex items-center gap-1">
            <SlidersHorizontal className="size-3" /> Quick views:
          </span>
          <button
            type="button"
            onClick={() => onFilterChange('status', 'OPEN')}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              filters.status === 'OPEN'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            All Open
          </button>
          <button
            type="button"
            onClick={() => {
              onFilterChange('status', 'OPEN');
              onFilterChange('severity', 'CRITICAL');
            }}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              filters.severity === 'CRITICAL' && filters.status === 'OPEN'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Critical Issues
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('repairableOnly', !filters.repairableOnly)}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors flex items-center gap-1 ${
              filters.repairableOnly
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Wrench className="size-3" />
            Repairable Projections
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('status', 'ACCEPTED')}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              filters.status === 'ACCEPTED'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Accepted Tolerances
          </button>
          <button
            type="button"
            onClick={() => onFilterChange('status', 'RESOLVED')}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
              filters.status === 'RESOLVED'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            Resolved History
          </button>
        </div>
      </PagePanel>

      {/* 2. Findings Table */}
      <PagePanel className="p-0 overflow-hidden border border-border">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-sm">Loading integrity findings…</p>
          </div>
        ) : findings.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-semibold text-foreground">No integrity findings match the filter</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              {hasActiveFilters
                ? 'Try adjusting your search criteria, severity, or module filter.'
                : 'No discrepancies have been recorded in completed scans.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={onResetFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-24 text-xs font-semibold">Severity</TableHead>
                  <TableHead className="text-xs font-semibold">Finding / Summary</TableHead>
                  <TableHead className="w-28 text-xs font-semibold">Module</TableHead>
                  <TableHead className="text-xs font-semibold">Affected Entity</TableHead>
                  <TableHead className="w-24 text-xs font-semibold text-center">Occurrences</TableHead>
                  <TableHead className="w-28 text-xs font-semibold">Status</TableHead>
                  <TableHead className="w-32 text-xs font-semibold">Recovery</TableHead>
                  <TableHead className="w-24 text-xs font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((finding) => {
                  const entity = getEntityLink(finding.entity_type, finding.entity_id);

                  return (
                    <TableRow
                      key={finding.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => onOpenFinding(finding)}
                    >
                      <TableCell>
                        <StatusBadge status={finding.severity} />
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="space-y-0.5">
                          <p className="text-sm font-semibold text-foreground line-clamp-1">
                            {finding.summary}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">
                            {finding.code}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                          {finding.domain}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entity ? (
                          entity.href ? (
                            <Link
                              href={entity.href}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-primary hover:underline flex items-center gap-1 font-mono"
                            >
                              {entity.label}
                              <ExternalLink className="size-2.5 opacity-70" />
                            </Link>
                          ) : (
                            <span className="text-xs text-muted-foreground font-mono">
                              {entity.label}
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground italic">None specified</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs tabular-nums">
                        {finding.occurrence_count > 1 ? (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-semibold">
                            {finding.occurrence_count}×
                          </span>
                        ) : (
                          <span className="text-muted-foreground">1×</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={finding.status} />
                      </TableCell>
                      <TableCell>
                        {finding.repairability === 'REBUILDABLE_PROJECTION' ? (
                          <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 font-medium">
                            <Wrench className="size-2.5" />
                            Rebuildable
                          </span>
                        ) : (
                          <span className="text-2xs text-muted-foreground">Diagnosis only</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5 cursor-pointer"
                          onClick={() => onOpenFinding(finding)}
                        >
                          Investigate
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 3. Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border bg-card">
            <p className="text-xs text-muted-foreground">
              Showing page <span className="font-mono font-medium text-foreground">{currentPage}</span> of{' '}
              <span className="font-mono font-medium text-foreground">{totalPages}</span> ({totalItems} total findings)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="h-8 text-xs cursor-pointer"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="h-8 text-xs cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </PagePanel>
    </div>
  );
}
