'use client';

import { useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';
import { LandedCostWorkspace } from '@/components/costing/landed-cost-workspace';
import { CostingWorkspace } from '@/components/costing/costing-workspace';

type Screen = 'landed-cost' | 'costing';
type Notice = { tone: 'error' | 'success'; message: string } | undefined;

interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  status: string;
  allocations: readonly any[];
}
interface Worksheet {
  id: string;
  shipment_id: string;
  worksheet_number: string;
  base_currency_code: string;
  status: string;
  current_revision_id: string | null;
  finalized_at: string | null;
  revisions: readonly any[];
  components: readonly any[];
  results: readonly any[];
}
interface Layer {
  id: string;
  remaining_quantity: string;
  original_quantity: string;
  effective_cost: string;
  currency_code: string;
  location_name: string;
  condition_code: string;
  product_title: string;
  sku: string;
  receipt_number: string;
  received_at: string;
  cost_state: string;
}
interface Assignment {
  id: string;
  fulfillment_id: string;
  status: string;
  total_cost: string;
  currency_code: string;
  quantity: string;
  order_number: string;
  product_title: string;
  sku: string;
  created_at: string;
}
interface Cogs {
  id: string;
  delivery_id: string | null;
  fulfillment_id: string;
  order_number: string;
  total_cost: string;
  currency_code: string;
  created_at: string;
}
interface Valuation {
  inventory_item_id: string;
  location_id: string;
  product_title: string;
  sku: string;
  location_name: string;
  condition_code: string;
  currency_code: string;
  quantity: string;
  value: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string } | string;
  };
  if (!response.ok)
    throw new Error(
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? 'The command was rejected.'),
    );
  return body;
}

export function CostingConsole({ section }: { readonly section: Screen }) {
  const [shipments, setShipments] = useState<readonly Shipment[]>([]);
  const [worksheets, setWorksheets] = useState<readonly Worksheet[]>([]);
  const [layers, setLayers] = useState<readonly Layer[]>([]);
  const [assignments, setAssignments] = useState<readonly Assignment[]>([]);
  const [cogs, setCogs] = useState<readonly Cogs[]>([]);
  const [valuation, setValuation] = useState<readonly Valuation[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      if (section === 'landed-cost') {
        const [shipmentResult, worksheetResult] = await Promise.all([
          request<ApiEnvelope<readonly Shipment[]>>('/admin/inbound-shipments'),
          request<ApiEnvelope<readonly Worksheet[]>>('/admin/landed-cost/worksheets'),
        ]);
        setShipments(shipmentResult.data);
        setWorksheets(worksheetResult.data);
      } else {
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
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error instanceof Error ? error.message : 'Unable to load costing operations.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [section]);

  return (
    <main className="p-6 h-full flex flex-col min-w-0">
      <div className="flex-1 overflow-auto">
        <h1 className="text-2xl font-semibold mb-2">
          {section === 'landed-cost' ? 'Landed Cost' : 'Costing'}
        </h1>
        <p className="text-muted-foreground mb-6">
          {section === 'landed-cost'
            ? 'Allocate freight, duties, and handling to inbound inventory.'
            : 'Explore authoritative FIFO cost layers, outbound assignments, and recognized COGS.'}
        </p>

        {notice ? (
          <div className={`p-4 rounded-md mb-6 ${notice.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'}`}>
            {notice.message}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">Loading...</div>
        ) : (
          <>
            {section === 'landed-cost' && (
              <div className="mt-8">
                <LandedCostWorkspace worksheets={worksheets} shipments={shipments} reload={reload} />
              </div>
            )}
            {section === 'costing' && (
              <div className="mt-8">
                <CostingWorkspace layers={layers} assignments={assignments} cogs={cogs} valuation={valuation} />
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
