'use client';

import * as React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PagePanel } from '@/components/ui/page-shell';
import {
  executeFindingRepair,
  previewFindingRepair,
} from '@/lib/integrity/api';
import type {
  IntegrityFindingDetailDto,
  IntegrityRepairPreviewDto,
} from '@/lib/integrity/types';

interface RepairWorkflowDialogProps {
  finding: IntegrityFindingDetailDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRepairCompleted: () => void;
}

export function RepairWorkflowDialog({
  finding,
  open,
  onOpenChange,
  onRepairCompleted,
}: RepairWorkflowDialogProps) {
  const [step, setStep] = React.useState<'preview' | 'executing' | 'result'>('preview');
  const [preview, setPreview] = React.useState<IntegrityRepairPreviewDto | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [repairResult, setRepairResult] = React.useState<{
    id: string;
    status: string;
    verificationRunId?: string;
  } | null>(null);
  const [executing, setExecuting] = React.useState(false);
  const [executionError, setExecutionError] = React.useState<string | null>(null);

  // Load repair preview when dialog opens
  React.useEffect(() => {
    if (!finding?.id || !open) {
      setStep('preview');
      setPreview(null);
      setPreviewError(null);
      setRepairResult(null);
      setExecutionError(null);
      return;
    }

    let active = true;
    setLoadingPreview(true);
    setPreviewError(null);

    previewFindingRepair(finding.id)
      .then((data) => {
        if (active) setPreview(data);
      })
      .catch((err) => {
        if (active) setPreviewError(err instanceof Error ? err.message : 'Unable to preview repair.');
      })
      .finally(() => {
        if (active) setLoadingPreview(false);
      });

    return () => {
      active = false;
    };
  }, [finding?.id, open]);

  if (!finding) return null;

  const handleExecuteRepair = async () => {
    if (!preview) return;
    setStep('executing');
    setExecuting(true);
    setExecutionError(null);

    try {
      const result = await executeFindingRepair(finding.id, {
        findingVersion: preview.findingVersion,
        repairKey: preview.key as 'ANALYTICS' | 'REVIEW_RATINGS',
      });

      setRepairResult(result);
      setStep('result');
      onRepairCompleted();
    } catch (err) {
      setExecutionError(
        err instanceof Error
          ? err.message
          : 'The recovery operation was rejected by the server.',
      );
      setStep('result');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider mb-1">
            <Wrench className="size-3.5" />
            Controlled Recovery Workflow
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            Repair: {finding.summary}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Idempotent domain projection rebuild followed by authoritative verification.
          </DialogDescription>
        </DialogHeader>

        {/* STEP 1: PREVIEW */}
        {step === 'preview' && (
          <div className="space-y-4 py-2">
            {loadingPreview ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="size-5 animate-spin text-primary" />
                <p className="text-xs">Evaluating preconditions and recovery dry-run…</p>
              </div>
            ) : previewError ? (
              <PagePanel className="p-4 border-rose-200 bg-rose-50/50 text-rose-800 text-xs space-y-1">
                <p className="font-semibold">Repair Preview Unavailable</p>
                <p>{previewError}</p>
              </PagePanel>
            ) : preview ? (
              <div className="space-y-3 text-xs">
                {/* Proposed Recovery */}
                <div className="p-3.5 rounded-lg border border-border bg-card space-y-1">
                  <span className="font-semibold text-foreground">Proposed Recovery Action</span>
                  <p className="text-muted-foreground leading-relaxed">{preview.description}</p>
                </div>

                {/* Expected Effects */}
                <div className="p-3.5 rounded-lg border border-border bg-card space-y-1.5">
                  <span className="font-semibold text-foreground">Expected State Changes</span>
                  <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                    {preview.effects.map((eff, i) => (
                      <li key={i}>{eff}</li>
                    ))}
                  </ul>
                </div>

                {/* Risk and Preconditions */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                    <span className="font-semibold text-foreground">Risk Category</span>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded text-2xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                        {preview.risk} RISK
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-card space-y-1">
                    <span className="font-semibold text-foreground">Target Version</span>
                    <p className="font-mono text-muted-foreground">v{preview.findingVersion} (Optimistic lock)</p>
                  </div>
                </div>

                {/* Verification Strategy */}
                <div className="p-3.5 rounded-lg border border-sky-500/20 bg-sky-500/5 space-y-1 text-sky-800 dark:text-sky-300">
                  <span className="font-semibold flex items-center gap-1">
                    <ShieldCheck className="size-3.5" /> Post-Repair Verification Plan
                  </span>
                  <p className="leading-relaxed opacity-90">{preview.verification}</p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* STEP 2: EXECUTING */}
        {step === 'executing' && (
          <div className="py-12 text-center space-y-3">
            <RefreshCw className="size-8 animate-spin text-primary mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">Rebuilding projection & verifying…</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              The domain rebuild is executing. Immediately upon completion, a targeted verification check will confirm whether the discrepancy is fully resolved.
            </p>
          </div>
        )}

        {/* STEP 3: RESULT */}
        {step === 'result' && (
          <div className="space-y-4 py-2">
            {executionError ? (
              <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldAlert className="size-4 text-rose-600" />
                  Repair Execution Rejected
                </div>
                <p className="text-xs leading-relaxed">{executionError}</p>
              </div>
            ) : repairResult?.status === 'SUCCEEDED' ? (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <CheckCircle2 className="size-5 text-emerald-600" />
                  Verified Resolved
                </div>
                <p className="text-xs leading-relaxed">
                  The domain rebuild completed successfully. The immediate post-repair verification check re-evaluated the invariant and confirmed that the discrepancy is cleared. The finding has been marked <strong>RESOLVED</strong>.
                </p>
                {repairResult.verificationRunId && (
                  <p className="text-2xs font-mono opacity-80">
                    Verification scan ID: {repairResult.verificationRunId}
                  </p>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <AlertTriangle className="size-5 text-amber-600" />
                  Repair Completed; Issue Remains Detected
                </div>
                <p className="text-xs leading-relaxed">
                  The rebuild operation finished, but the post-repair verification check still observed discrepancies. The finding remains <strong>OPEN</strong> for manual operator investigation.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2 border-t border-border">
          {step === 'preview' && (
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleExecuteRepair}
                disabled={loadingPreview || Boolean(previewError) || !preview}
                className="cursor-pointer"
              >
                <Wrench className="size-3.5 mr-1.5" />
                Confirm & Rebuild
              </Button>
            </div>
          )}

          {step === 'result' && (
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto cursor-pointer"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
