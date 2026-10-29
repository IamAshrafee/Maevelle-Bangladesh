'use client';

import * as React from 'react';
import {
  Archive,
  ArrowUpDown,
  BadgePercent,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Filter,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
  Sparkles,
  Tag,
  Ticket,
} from 'lucide-react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/page-shell';
import type { PromotionItem, PromotionStatus, PromotionType } from './types';

interface PromotionsTableProps {
  readonly promotions: readonly PromotionItem[];
  readonly loading: boolean;
  readonly onSelectPromotion: (promotion: PromotionItem) => void;
  readonly onEditPromotion: (promotion: PromotionItem) => void;
  readonly onStatusChange: (promotion: PromotionItem, targetStatus: PromotionStatus) => void;
  readonly onAddCoupon: (promotion: PromotionItem) => void;
  readonly onCreateNew: () => void;
}

export function PromotionsTable({
  promotions,
  loading,
  onSelectPromotion,
  onEditPromotion,
  onStatusChange,
  onAddCoupon,
  onCreateNew,
}: PromotionsTableProps) {
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'ALL' | PromotionStatus>('ALL');
  const [typeFilter, setTypeFilter] = React.useState<'ALL' | PromotionType>('ALL');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);

  function copyCode(code: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((c) => (c === code ? null : c));
    }, 2000);
  }

  // Filter & Search Logic
  const filteredPromotions = React.useMemo(() => {
    return promotions.filter((promo) => {
      // Status filter
      if (statusFilter !== 'ALL' && promo.status !== statusFilter) return false;

      // Type filter
      if (typeFilter !== 'ALL' && promo.promotionType !== typeFilter) return false;

      // Search query
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = promo.name.toLowerCase().includes(query);
        const matchesCoupon = promo.coupons.some((c) => c.code.toLowerCase().includes(query));
        if (!matchesName && !matchesCoupon) return false;
      }

      return true;
    });
  }, [promotions, search, statusFilter, typeFilter]);

  // Counts for tabs
  const statusCounts = React.useMemo(() => {
    return {
      ALL: promotions.length,
      ACTIVE: promotions.filter((p) => p.status === 'ACTIVE').length,
      DRAFT: promotions.filter((p) => p.status === 'DRAFT').length,
      INACTIVE: promotions.filter((p) => p.status === 'INACTIVE').length,
      ARCHIVED: promotions.filter((p) => p.status === 'ARCHIVED').length,
    };
  }, [promotions]);

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {(
            [
              { key: 'ALL', label: 'All' },
              { key: 'ACTIVE', label: 'Active' },
              { key: 'DRAFT', label: 'Draft' },
              { key: 'INACTIVE', label: 'Paused' },
              { key: 'ARCHIVED', label: 'Archived' },
            ] as const
          ).map((tab) => {
            const isSelected = statusFilter === tab.key;
            const count = statusCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-card text-foreground font-semibold border border-border shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[0.65rem] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Secondary Filter Controls */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign or code…"
              className="pl-8 h-8 text-xs bg-card"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  <Filter className="size-3 text-muted-foreground" />
                  <span>
                    {typeFilter === 'ALL'
                      ? 'All Types'
                      : typeFilter === 'COUPON'
                        ? 'Coupons'
                        : 'Automatic'}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Trigger Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTypeFilter('ALL')}>All Types</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('COUPON')}>
                Coupons only
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTypeFilter('AUTOMATIC')}>
                Automatic only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-muted-foreground hidden sm:inline-flex"
            onClick={() => setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))}
          >
            {density === 'comfortable' ? 'Compact' : 'Comfortable'}
          </Button>
        </div>
      </div>

      {/* Main Promotions Table */}
      {filteredPromotions.length === 0 && !loading ? (
        <EmptyState
          icon={BadgePercent}
          title={
            search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'No matching promotions'
              : 'No promotions yet'
          }
          description={
            search || statusFilter !== 'ALL' || typeFilter !== 'ALL'
              ? 'Try modifying your search or clearing active filters.'
              : 'Create promotional campaigns and coupon codes to incentivize purchases.'
          }
          action={
            <Button onClick={onCreateNew} size="sm" className="gap-1.5">
              <Plus className="size-4" /> Create First Promotion
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
          <Table density={density}>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Benefit</TableHead>
                <TableHead>Coupon Codes</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead className="text-right">Committed Uses</TableHead>
                <TableHead className="text-right">Discount Total</TableHead>
                <TableHead className="w-10 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPromotions.map((promo) => {
                const isPercentage = promo.benefitType === 'PERCENTAGE_DISCOUNT';
                const benefitValueFormatted = isPercentage
                  ? `${parseFloat(promo.benefitValue)}% OFF`
                  : `৳ ${parseFloat(promo.benefitValue).toFixed(0)} OFF`;

                const targetLabel =
                  promo.targetCategoryCount || promo.targetProductCount
                    ? `${(promo.targetCategoryCount ?? 0) + (promo.targetProductCount ?? 0)} targets`
                    : 'Storewide';

                return (
                  <TableRow
                    key={promo.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors duration-150"
                    onClick={() => onSelectPromotion(promo)}
                  >
                    {/* Campaign Identity */}
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <strong className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
                          {promo.name}
                        </strong>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[0.65rem] text-muted-foreground uppercase font-semibold">
                            {promo.promotionType}
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span
                            className={`text-[0.65rem] px-1.5 py-0.2 rounded font-medium ${
                              promo.combinability === 'EXCLUSIVE'
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            }`}
                          >
                            {promo.combinability}
                          </span>
                          <span className="text-muted-foreground/40">·</span>
                          <span className="text-[0.65rem] text-muted-foreground">
                            {targetLabel}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell>
                      <StatusBadge status={promo.status} />
                    </TableCell>

                    {/* Benefit */}
                    <TableCell>
                      <div className="flex flex-col">
                        <strong className="font-mono text-xs font-bold text-foreground">
                          {benefitValueFormatted}
                        </strong>
                        {promo.minimumMerchandiseSubtotal ? (
                          <span className="text-[0.68rem] text-muted-foreground font-mono">
                            Min ৳ {parseFloat(promo.minimumMerchandiseSubtotal).toFixed(0)}
                          </span>
                        ) : (
                          <span className="text-[0.65rem] text-muted-foreground/70">No min spend</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Coupon Codes */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {promo.coupons.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">Automatic</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {promo.coupons.slice(0, 2).map((c) => {
                            const isCopied = copiedCode === c.code;
                            return (
                              <TooltipProvider key={c.id} delay={100}>
                                <Tooltip>
                                  <TooltipTrigger
                                    render={
                                      <button
                                        type="button"
                                        onClick={(e) => copyCode(c.code, e)}
                                        className="inline-flex items-center gap-1 rounded bg-muted/80 hover:bg-muted px-2 py-0.5 text-xs font-mono font-medium tracking-wide text-foreground border border-border/50 group"
                                      />
                                    }
                                  >
                                    <span>{c.code}</span>
                                    {isCopied ? (
                                      <Check className="size-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="size-3 text-muted-foreground opacity-60 group-hover:opacity-100" />
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {isCopied ? 'Copied code!' : 'Click to copy coupon code'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })}

                          {promo.coupons.length > 2 && (
                            <span className="text-[0.68rem] text-muted-foreground font-mono">
                              +{promo.coupons.length - 2} more
                            </span>
                          )}
                        </div>
                      )}
                    </TableCell>

                    {/* Schedule */}
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      <div>
                        {promo.startsAt
                          ? new Date(promo.startsAt).toLocaleDateString()
                          : 'Immediate'}
                      </div>
                      <div className="text-[0.68rem] text-muted-foreground/80">
                        {promo.endsAt ? `until ${new Date(promo.endsAt).toLocaleDateString()}` : 'Ongoing'}
                      </div>
                    </TableCell>

                    {/* Committed Uses */}
                    <TableCell className="text-right font-mono tabular-nums text-xs font-semibold text-foreground">
                      {promo.committedUsageCount}
                    </TableCell>

                    {/* Discount Total */}
                    <TableCell className="text-right font-mono tabular-nums text-xs font-bold text-foreground">
                      ৳ {parseFloat(promo.committedDiscount || '0').toFixed(2)}
                    </TableCell>

                    {/* Row Action Dropdown */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" className="size-7">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => onSelectPromotion(promo)}>
                            <Eye className="size-3.5 mr-2 text-muted-foreground" />
                            View Details
                          </DropdownMenuItem>

                          <DropdownMenuItem onClick={() => onEditPromotion(promo)}>
                            <Edit3 className="size-3.5 mr-2 text-muted-foreground" />
                            Edit Campaign
                          </DropdownMenuItem>

                          {promo.promotionType === 'COUPON' && (
                            <DropdownMenuItem onClick={() => onAddCoupon(promo)}>
                              <Ticket className="size-3.5 mr-2 text-muted-foreground" />
                              Add Coupon Code
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          {promo.status === 'ACTIVE' ? (
                            <DropdownMenuItem
                              onClick={() => onStatusChange(promo, 'INACTIVE')}
                              className="text-amber-600 dark:text-amber-400"
                            >
                              <PauseCircle className="size-3.5 mr-2" />
                              Pause Campaign
                            </DropdownMenuItem>
                          ) : promo.status === 'INACTIVE' || promo.status === 'DRAFT' ? (
                            <DropdownMenuItem
                              onClick={() => onStatusChange(promo, 'ACTIVE')}
                              className="text-emerald-600 dark:text-emerald-400"
                            >
                              <PlayCircle className="size-3.5 mr-2" />
                              Activate Campaign
                            </DropdownMenuItem>
                          ) : null}

                          {promo.status !== 'ARCHIVED' && (
                            <DropdownMenuItem
                              onClick={() => onStatusChange(promo, 'ARCHIVED')}
                              className="text-destructive"
                            >
                              <Archive className="size-3.5 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
