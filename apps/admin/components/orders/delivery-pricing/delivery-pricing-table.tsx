'use client';

import * as React from 'react';
import {
  Calculator,
  Edit2,
  Globe,
  MapPin,
  Power,
  RotateCw,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState } from '@/components/ui/page-shell';

import { type DeliveryPricingRule, formatMoney } from './types';

interface DeliveryPricingTableProps {
  readonly rules: readonly DeliveryPricingRule[];
  readonly density: 'comfortable' | 'compact';
  readonly busy: boolean;
  readonly onEdit: (rule: DeliveryPricingRule) => void;
  readonly onToggleStatus: (rule: DeliveryPricingRule) => void;
  readonly onTestInSimulator: (rule: DeliveryPricingRule) => void;
  readonly onResetFilters?: () => void;
}

export function DeliveryPricingTable({
  rules,
  density,
  busy,
  onEdit,
  onToggleStatus,
  onTestInSimulator,
  onResetFilters,
}: DeliveryPricingTableProps) {
  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No delivery pricing rules found"
        description="Try adjusting your search query, status filters, or geographic scope filter."
        action={
          onResetFilters ? (
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              Clear all filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="w-full">
      <Table density={density}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24 sm:w-28">
              <div className="flex items-center gap-1.5">
                <span>Priority</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Priority explanation"
                        className="inline-flex size-3.5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground cursor-help"
                      />
                    }
                  >
                    <span className="text-[10px] font-bold border border-current rounded-full size-3.5 flex items-center justify-center">
                      ?
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Higher priority rules are evaluated first. If two rules share the same priority,
                    the rule with the more specific geographic node takes precedence over country defaults.
                  </TooltipContent>
                </Tooltip>
              </div>
            </TableHead>
            <TableHead>Rule & Scope</TableHead>
            <TableHead className="text-right">Delivery Charge</TableHead>
            <TableHead className="w-28 text-center">Status</TableHead>
            <TableHead className="w-28 hidden md:table-cell text-muted-foreground text-xs">
              Version
            </TableHead>
            <TableHead className="w-40 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rules.map((rule) => {
            const isNationwide = !rule.geography_node_id;
            const isPriorityHigh = rule.priority >= 10;

            return (
              <TableRow key={rule.id} className="group">
                {/* Priority */}
                <TableCell className="align-middle">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-mono tabular-nums font-semibold ${
                        isPriorityHigh
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'bg-muted text-muted-foreground border border-border'
                      }`}
                    >
                      P{rule.priority}
                    </span>
                  </div>
                </TableCell>

                {/* Rule Name & Scope */}
                <TableCell className="align-middle">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm tracking-tight">
                        {rule.name}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {isNationwide ? (
                        <span className="inline-flex items-center gap-1 rounded bg-secondary/80 px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                          <Globe className="size-3 text-primary shrink-0" />
                          <span>Nationwide ({rule.country_code})</span>
                        </span>
                      ) : (
                        <div className="inline-flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">
                            <MapPin className="size-3 text-sky-600 dark:text-sky-400 shrink-0" />
                            <span>{rule.geography_node_name ?? 'Specific zone'}</span>
                          </span>

                          {rule.geography_node_type && (
                            <Badge variant="outline" className="text-[10px] h-4 py-0 px-1 uppercase tracking-wide">
                              {rule.geography_node_type.replace(/_/g, ' ')}
                            </Badge>
                          )}

                          {rule.geography_parent_name && (
                            <span className="text-[11px] text-muted-foreground">
                              in {rule.geography_parent_name}
                            </span>
                          )}
                        </div>
                      )}

                      <span className="text-muted-foreground/50">·</span>
                      <span className="font-mono text-[11px] uppercase text-muted-foreground">
                        {rule.currency_code}
                      </span>
                    </div>
                  </div>
                </TableCell>

                {/* Delivery Charge */}
                <TableCell className="text-right align-middle">
                  <span className="font-mono tabular-nums text-sm sm:text-base font-semibold text-foreground">
                    {formatMoney(rule.flat_amount, rule.currency_code)}
                  </span>
                </TableCell>

                {/* Status Badge */}
                <TableCell className="text-center align-middle">
                  <StatusBadge status={rule.status} />
                </TableCell>

                {/* Version */}
                <TableCell className="hidden md:table-cell align-middle text-muted-foreground text-xs font-mono tabular-nums">
                  v{rule.version}
                </TableCell>

                {/* Action Buttons */}
                <TableCell className="text-right align-middle">
                  <div className="flex items-center justify-end gap-1">
                    {/* Test in Simulator */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => onTestInSimulator(rule)}
                            disabled={busy}
                            aria-label={`Test rule ${rule.name} in simulator`}
                          />
                        }
                      >
                        <Calculator className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Test in fee simulator</TooltipContent>
                    </Tooltip>

                    {/* Edit */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => onEdit(rule)}
                            disabled={busy}
                            aria-label={`Edit ${rule.name}`}
                          />
                        }
                      >
                        <Edit2 className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>Edit rule configuration</TooltipContent>
                    </Tooltip>

                    {/* Status Toggle */}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant={rule.status === 'ACTIVE' ? 'ghost' : 'outline'}
                            size="sm"
                            className={`size-8 p-0 ${
                              rule.status === 'ACTIVE'
                                ? 'text-muted-foreground hover:text-destructive'
                                : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                            }`}
                            onClick={() => onToggleStatus(rule)}
                            disabled={busy}
                            aria-label={rule.status === 'ACTIVE' ? `Deactivate ${rule.name}` : `Activate ${rule.name}`}
                          />
                        }
                      >
                        <Power className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {rule.status === 'ACTIVE' ? 'Deactivate rule' : 'Activate rule'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

