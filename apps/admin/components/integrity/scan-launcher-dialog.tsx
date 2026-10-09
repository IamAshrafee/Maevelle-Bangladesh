'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Layers,
  Play,
  RefreshCw,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { requestIntegrityRun } from '@/lib/integrity/api';
import type { IntegrityCheckDto } from '@/lib/integrity/types';

interface ScanLauncherDialogProps {
  checks: readonly IntegrityCheckDto[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScanLaunched: () => void;
  initialCheckId?: string | undefined;
}

export function ScanLauncherDialog({
  checks,
  open,
  onOpenChange,
  onScanLaunched,
  initialCheckId,
}: ScanLauncherDialogProps) {
  const [scopeMode, setScopeMode] = React.useState<'ALL' | 'MODULE' | 'CHECK'>('ALL');
  const [selectedModule, setSelectedModule] = React.useState('Inventory');
  const [selectedCheckId, setSelectedCheckId] = React.useState(initialCheckId || 'inventory.core');
  const [executeInline, setExecuteInline] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Sync initial check if provided
  React.useEffect(() => {
    if (initialCheckId) {
      setScopeMode('CHECK');
      setSelectedCheckId(initialCheckId);
    }
  }, [initialCheckId]);

  const modules = React.useMemo(() => {
    return Array.from(new Set(checks.map((c) => c.module))).sort();
  }, [checks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload: {
        module?: string;
        checkIds?: string[];
        executeInline?: boolean;
      } = {
        executeInline,
      };

      if (scopeMode === 'MODULE') {
        payload.module = selectedModule;
      } else if (scopeMode === 'CHECK') {
        payload.checkIds = [selectedCheckId];
      }

      await requestIntegrityRun(payload);
      onOpenChange(false);
      onScanLaunched();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to launch scan. An equivalent scan may already be running.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
              <Play className="size-3.5" />
              Launch Integrity Scan
            </div>
            <DialogTitle className="text-lg font-bold text-foreground">
              Configure Scan Scope
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select verification breadth and execution mode for the target organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            {error && (
              <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300">
                {error}
              </div>
            )}

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Scan Scope</label>
              <NativeSelect
                value={scopeMode}
                onChange={(e) => setScopeMode(e.target.value as any)}
                className="h-9 text-xs"
              >
                <option value="ALL">All Eligible Platform Checks (Comprehensive)</option>
                <option value="MODULE">Specific Business Domain / Module</option>
                <option value="CHECK">Targeted Single Check Rule</option>
              </NativeSelect>
            </div>

            {/* Module Picker if MODULE */}
            {scopeMode === 'MODULE' && (
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Target Domain</label>
                <NativeSelect
                  value={selectedModule}
                  onChange={(e) => setSelectedModule(e.target.value)}
                  className="h-9 text-xs"
                >
                  {modules.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {/* Check Picker if CHECK */}
            {scopeMode === 'CHECK' && (
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Specific Integrity Rule</label>
                <NativeSelect
                  value={selectedCheckId}
                  onChange={(e) => setSelectedCheckId(e.target.value)}
                  className="h-9 text-xs"
                >
                  {checks.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id}) — {c.cost} COST
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {/* Execution Mode */}
            <div className="p-3 rounded-lg border border-border bg-card space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={executeInline}
                  onChange={(e) => setExecuteInline(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary size-4 cursor-pointer"
                />
                <span>Execute Inline Immediately</span>
              </label>
              <p className="text-2xs text-muted-foreground pl-6 leading-relaxed">
                {executeInline
                  ? 'Runs checks directly inside the API request cycle. Suitable for immediate targeted verification or local development.'
                  : 'Queues the scan for background execution by the leased PostgreSQL Worker service.'}
              </p>
            </div>

            {/* Cost & Operational Advice */}
            <div className="p-3 rounded-lg border border-muted bg-muted/30 text-2xs text-muted-foreground space-y-1">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <Zap className="size-3 text-amber-500" /> Operational Notice
              </span>
              <p className="leading-relaxed">
                Full-system scans evaluate cross-domain transactional databases (Costing layers, Inventory ledgers, and Analytics). Scans are concurrency-protected to prevent overlapping execution.
              </p>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading} className="cursor-pointer">
              {loading ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                  Launching…
                </>
              ) : (
                <>
                  <Play className="size-3.5 mr-1.5" />
                  Start Scan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
