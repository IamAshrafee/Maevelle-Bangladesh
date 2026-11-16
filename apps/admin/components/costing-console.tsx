'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { CostingEvidence } from '@/components/supply/costing-evidence';
import {
  CostingHelpButton,
  CostingHelpDialog,
  CostingSummary,
} from '@/components/supply/costing-page-ui';
import { Button } from '@/components/ui/button';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { supplyRequest as request } from '@/lib/supply/api';
import type {
  Assignment,
  Cogs,
  CostingNotice as Notice,
  Layer,
  Valuation,
} from '@/lib/supply/costing-types';

const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function CostingConsole() {
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
    <AdminPage variant="standard">
      <PageHeader
        eyebrow="Inventory / Cost & valuation"
        title="Costing"
        description="Trace receipt-backed FIFO cost, inventory value, outbound assignments, and recognized COGS."
        actions={
          <>
            <CostingHelpButton onClick={() => setHelpOpen(true)} />
            <Button variant="outline" onClick={() => void reload()} type="button">
              Refresh
            </Button>
          </>
        }
      />

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
        <p className="rounded-md border border-border bg-card p-6 text-sm text-muted-foreground">
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

      <CostingHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </AdminPage>
  );
}
