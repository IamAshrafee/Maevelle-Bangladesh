'use client';

import * as React from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  Search,
  Shield,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { StatusBadge } from '@/components/status-badge';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import type { IntegrityCheckDto } from '@/lib/integrity/types';

interface ChecksTabProps {
  checks: readonly IntegrityCheckDto[];
  loading: boolean;
  canRunChecks: boolean;
  onRunSingleCheck: (checkId: string) => void;
}

export function ChecksTab({
  checks,
  loading,
  canRunChecks,
  onRunSingleCheck,
}: ChecksTabProps) {
  const [search, setSearch] = React.useState('');
  const [selectedModule, setSelectedModule] = React.useState('ALL');
  const [selectedCost, setSelectedCost] = React.useState('ALL');
  const [selectedCategory, setSelectedCategory] = React.useState('ALL');

  const modules = React.useMemo(() => {
    return Array.from(new Set(checks.map((c) => c.module))).sort();
  }, [checks]);

  const categories = React.useMemo(() => {
    return Array.from(new Set(checks.map((c) => c.category))).sort();
  }, [checks]);

  const filteredChecks = React.useMemo(() => {
    return checks.filter((c) => {
      if (selectedModule !== 'ALL' && c.module !== selectedModule) return false;
      if (selectedCost !== 'ALL' && c.cost !== selectedCost) return false;
      if (selectedCategory !== 'ALL' && c.category !== selectedCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.invariant.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [checks, selectedModule, selectedCost, selectedCategory, search]);

  const hasFilters =
    selectedModule !== 'ALL' ||
    selectedCost !== 'ALL' ||
    selectedCategory !== 'ALL' ||
    Boolean(search.trim());

  return (
    <div className="space-y-4">
      {/* 1. Header & Filters */}
      <PagePanel className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search checks by name, ID, or invariant rule…"
              className="pl-9 h-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="h-9 text-xs w-32"
            >
              <option value="ALL">All Modules</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-9 text-xs w-36"
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.replace('_', ' ')}
                </option>
              ))}
            </NativeSelect>

            <NativeSelect
              value={selectedCost}
              onChange={(e) => setSelectedCost(e.target.value)}
              className="h-9 text-xs w-28"
            >
              <option value="ALL">All Costs</option>
              <option value="LIGHT">Light</option>
              <option value="MODERATE">Moderate</option>
              <option value="HEAVY">Heavy</option>
            </NativeSelect>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setSelectedModule('ALL');
                  setSelectedCost('ALL');
                  setSelectedCategory('ALL');
                }}
                className="h-9 px-2 text-xs text-muted-foreground"
              >
                <X className="size-3.5 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </PagePanel>

      {/* 2. Checks List */}
      <div className="space-y-3">
        {filteredChecks.length === 0 ? (
          <PagePanel className="p-8 text-center space-y-2">
            <Shield className="size-8 text-muted-foreground mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">No integrity checks match the filter</h4>
            <p className="text-xs text-muted-foreground">Try clearing or adjusting search terms.</p>
          </PagePanel>
        ) : (
          filteredChecks.map((check) => {
            const isRepairable = check.repairKeys.length > 0;

            return (
              <div
                key={check.id}
                className="p-5 rounded-xl border border-border bg-card space-y-3 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-foreground">{check.name}</span>
                      <code className="text-xs px-2 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                        {check.id} v{check.version}
                      </code>
                      <span className="text-2xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground font-semibold">
                        {check.module}
                      </span>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded font-mono font-semibold ${
                          check.cost === 'LIGHT'
                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                            : check.cost === 'MODERATE'
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {check.cost} COST
                      </span>
                      {isRepairable && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-700 dark:text-teal-400 font-medium flex items-center gap-1">
                          <Wrench className="size-2.5" />
                          Repairable
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {check.description}
                    </p>
                  </div>

                  {canRunChecks && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onRunSingleCheck(check.id)}
                      className="shrink-0 h-8 text-xs cursor-pointer self-end sm:self-start"
                    >
                      <Play className="size-3 mr-1.5" />
                      Run Check
                    </Button>
                  )}
                </div>

                {/* Invariant Statement Panel */}
                <div className="p-3 rounded-lg border border-border/80 bg-muted/30 text-xs space-y-1">
                  <span className="font-semibold text-foreground">Authoritative Invariant:</span>
                  <p className="text-muted-foreground font-mono leading-relaxed">{check.invariant}</p>
                </div>

                {/* Metadata Row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-2xs text-muted-foreground pt-1 border-t border-border/50">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" /> Cadence: <strong className="text-foreground">{check.schedule}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Default Severity: <strong className="text-foreground">{check.defaultSeverity}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Supported Scopes: <code className="font-mono">{check.supportedScopes.join(', ')}</code>
                  </span>
                  <span>·</span>
                  <span>
                    Required Capability: <code className="font-mono">{check.requiredCapability}</code>
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
