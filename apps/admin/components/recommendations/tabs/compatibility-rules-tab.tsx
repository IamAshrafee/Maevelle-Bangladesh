'use client';

import * as React from 'react';
import { Plus, Search, ArrowRight, Trash2, Edit3, Sparkles, X } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StatusBadge } from '@/components/status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EmptyState, LoadingState } from '@/components/ui/page-shell';
import type { RuleItem } from '../recommendations-types';

interface CompatibilityRulesTabProps {
  rules: RuleItem[];
  loading: boolean;
  total: number;
  page: number;
  query: string;
  onPageChange: (page: number) => void;
  onQueryChange: (query: string) => void;
  onAddRule: () => void;
  onEditRule: (rule: RuleItem) => void;
  onDeleteRule: (rule: RuleItem) => void;
  onToggleRule: (rule: RuleItem) => Promise<void>;
  canManage: boolean;
}

export function CompatibilityRulesTab({
  rules,
  loading,
  total,
  page,
  query,
  onPageChange,
  onQueryChange,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onToggleRule,
  canManage,
}: CompatibilityRulesTabProps) {
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  async function handleToggle(rule: RuleItem) {
    if (!canManage) return;
    setTogglingId(rule.id);
    try {
      await onToggleRule(rule);
    } finally {
      setTogglingId(null);
    }
  }

  const getStrengthVariant = (strength: number) => {
    if (strength >= 75) return 'text-primary font-bold';
    if (strength >= 50) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    if (strength >= 30) return 'text-amber-600 dark:text-amber-400 font-medium';
    return 'text-muted-foreground';
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
          <Input
            aria-label="Search compatibility rules"
            placeholder="Search by source or companion product type…"
            value={query}
            onChange={(e) => {
              onQueryChange(e.target.value);
              onPageChange(1);
            }}
            className="pl-9 pr-8 h-9 text-xs sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <Button
          type="button"
          disabled={!canManage}
          onClick={onAddRule}
          className="self-start sm:self-auto h-9 text-xs sm:text-sm gap-1.5 shadow-sm"
        >
          <Plus className="size-4" />
          Add Compatibility Rule
        </Button>
      </div>

      {/* Rules Table */}
      {loading && rules.length === 0 ? (
        <LoadingState message="Loading styling compatibility rules…" />
      ) : rules.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={query ? 'No rules match your search' : 'No compatibility rules defined yet'}
          description={
            query
              ? `No compatibility rules matched "${query}". Clear search or add a new rule.`
              : 'Add styling rules to link product types (e.g. Tops with Trousers or Sarees with Shawls) for Complete Your Look.'
          }
          action={
            query ? (
              <Button variant="outline" size="sm" onClick={() => onQueryChange('')}>
                Clear search
              </Button>
            ) : canManage ? (
              <Button size="sm" onClick={onAddRule}>
                <Plus className="size-3.5 mr-1" />
                Add your first rule
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="relative">
          <Table density="comfortable">
            <TableHeader>
              <TableRow>
                <TableHead>Source Product Type</TableHead>
                <TableHead className="w-8"></TableHead>
                <TableHead>Target Companion Type</TableHead>
                <TableHead>Styling Affinity Weight</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const isToggling = togglingId === rule.id;
                return (
                  <TableRow key={rule.id}>
                    {/* Source Type */}
                    <TableCell>
                      <span className="font-semibold text-foreground text-sm">
                        {rule.sourceName}
                      </span>
                    </TableCell>

                    {/* Arrow */}
                    <TableCell className="text-muted-foreground">
                      <ArrowRight className="size-3.5 text-primary" />
                    </TableCell>

                    {/* Target Type */}
                    <TableCell>
                      <span className="font-semibold text-foreground text-sm">
                        {rule.targetName}
                      </span>
                    </TableCell>

                    {/* Strength */}
                    <TableCell>
                      <div className="flex items-center gap-3 max-w-[200px]">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${rule.strength}%` }}
                          />
                        </div>
                        <span
                          className={`font-mono text-xs tabular-nums ${getStrengthVariant(rule.strength)}`}
                        >
                          {rule.strength}%
                        </span>
                      </div>
                    </TableCell>

                    {/* Status with Toggle */}
                    <TableCell className="text-center">
                      <div className="inline-flex items-center gap-2">
                        <StatusBadge
                          status={rule.enabled ? 'ACTIVE' : 'DISABLED'}
                          className="text-[11px] px-2 py-0.5"
                        />
                        <Switch
                          size="sm"
                          checked={rule.enabled}
                          disabled={!canManage || isToggling}
                          onCheckedChange={() => void handleToggle(rule)}
                          aria-label={`Toggle rule ${rule.sourceName} to ${rule.targetName}`}
                        />
                      </div>
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={!canManage}
                                  onClick={() => onEditRule(rule)}
                                  aria-label="Edit rule"
                                />
                              }
                            >
                              <Edit3 className="size-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Edit styling affinity</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-sm"
                                  disabled={!canManage}
                                  onClick={() => onDeleteRule(rule)}
                                  className="text-destructive hover:bg-destructive/10"
                                  aria-label="Delete rule"
                                />
                              }
                            >
                              <Trash2 className="size-3.5" />
                            </TooltipTrigger>
                            <TooltipContent>Delete rule</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          Page {page} · Total {total} compatibility rules
        </span>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs font-mono tabular-nums px-2 font-medium">Page {page}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page * 20 >= total || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
