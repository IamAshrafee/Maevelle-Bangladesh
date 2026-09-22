'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { CostingEvidence } from '@/components/supply/costing-evidence';
import {
  CostingHelpButton,
  CostingHelpDialog,
  CostingSummary,
} from '@/components/supply/costing-page-ui';
import { LandedCostConsole } from '@/components/supply/landed-cost/landed-cost-console';
import { Button } from '@/components/ui/button';
import { supplyRequest as request } from '@/lib/supply/api';
import type {
  Assignment,
  Cogs,
  CostingNotice as Notice,
  CostingScreen as Screen,
  Layer,
  Valuation,
} from '@/lib/supply/costing-types';

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function CostingConsole({ section = 'costing' }: { readonly section?: Screen }) {
  if (section === 'landed-cost') {
    return <LandedCostConsole />;
  }

  const [layers, setLayers] = useState<readonly Layer[]>([]);
  const [assignments, setAssignments] = useState<readonly Assignment[]>([]);
  const [cogs, setCogs] = useState<readonly Cogs[]>([]);
  const [valuation, setValuation] = useState<readonly Valuation[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [layerResult, assignmentResult, cogsResult, valuationResult] = await Promise.all([
        request<ApiEnvelope<readonly Layer[]>>('/admin/cost-layers'),
        request<ApiEnvelope<readonly Assignment[]>>('/admin/costing/outbound-assignments'),
        request<ApiEnvelope<readonly Cogs[]>>('/admin/costing/cogs'),
        request<ApiEnvelope<readonly Valuation[]>>('/admin/costing/valuation'),
      ]);
      setLayers(layerResult.data);
      setAssignments(assignmentResult.data);
      setCogs(cogsResult.data);
      setValuation(valuationResult.data);
    } catch (error) {
      setNotice({ tone: 'error', message: message(error, 'Unable to load costing operations.') });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">
              Inventory / Cost & valuation
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">Costing</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Trace receipt-backed FIFO cost, inventory value, outbound assignments, and recognized COGS.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CostingHelpButton onClick={() => setHelpOpen(true)} />
            <Button variant="outline" onClick={() => void reload()} type="button">
              Refresh
            </Button>
          </div>
        </header>

        {notice ? (
          <p
            className={
              notice.tone === 'error'
                ? 'rounded-md bg-destructive/10 p-3 text-sm text-destructive'
                : 'rounded-md bg-secondary p-3 text-sm'
            }
            role="status"
          >
            {notice.message}
          </p>
        ) : null}

        {loading ? (
          <p className="rounded-md border bg-background p-6 text-sm text-muted-foreground">
            Loading operational costing data…
          </p>
        ) : null}

        {!loading ? (
          <>
            <CostingSummary
              layers={layers}
              assignments={assignments}
              cogs={cogs}
              valuation={valuation}
            />
            <CostingEvidence
              layers={layers}
              assignments={assignments}
              cogs={cogs}
              valuation={valuation}
            />
          </>
        ) : null}
      </div>

      <CostingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}
