'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HelpCircle, Layers3, PackageCheck } from 'lucide-react';
import type { ApiEnvelope, InboundShipmentDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { SupplyWorkspaceNav } from '@/components/supply/supply-workspace-nav';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { LoadingState } from '@/components/ui/page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supplyRequest } from '@/lib/supply/api';
import type { Worksheet } from '@/lib/supply/costing-types';
import type { PagedEnvelope } from '@/lib/supply/types';
import { LandedCostHelpDialog } from '../costing-page-ui';
import { LandedCostStats } from './landed-cost-stats';
import { LandedCostUnstartedShipments } from './landed-cost-unstarted-shipments';
import { LandedCostWorksheetsTable } from './landed-cost-worksheets-table';

type WorkspaceView = 'worksheets' | 'awaiting';
type WorksheetStatus = 'ALL' | 'DRAFT' | 'FINALIZED';

export function LandedCostConsole() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManageCost = useAdminCapability('landed_cost.manage');
  const [worksheets, setWorksheets] = useState<readonly Worksheet[]>([]);
  const [shipments, setShipments] = useState<readonly InboundShipmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  const activeView: WorkspaceView =
    searchParams.get('view') === 'awaiting' ? 'awaiting' : 'worksheets';
  const searchQuery = searchParams.get('q') ?? '';
  const requestedStatus = searchParams.get('status');
  const statusFilter: WorksheetStatus =
    requestedStatus === 'DRAFT' || requestedStatus === 'FINALIZED' ? requestedStatus : 'ALL';

  function updateQuery(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function loadData(signal?: AbortSignal) {
    setLoading(true);
    setMessage('');
    try {
      const init = signal ? { signal } : undefined;
      const [shipmentRes, worksheetRes] = await Promise.all([
        supplyRequest<PagedEnvelope<InboundShipmentDto>>(
          '/admin/inbound-shipments?pageSize=100',
          init,
        ),
        supplyRequest<ApiEnvelope<readonly Worksheet[]>>('/admin/landed-cost/worksheets', init),
      ]);
      setWorksheets(worksheetRes.data);
      setShipments(shipmentRes.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Unable to load landed cost work.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, []);

  const unstartedShipments = useMemo(() => {
    const existingShipmentIds = new Set(worksheets.map((worksheet) => worksheet.shipment_id));
    return shipments.filter(
      (shipment) =>
        shipment.status === 'ARRIVED' &&
        shipment.receivingStatus === 'RECEIVED' &&
        !existingShipmentIds.has(shipment.id),
    );
  }, [shipments, worksheets]);

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Landed Cost Workspace', current: true },
        ]}
      />

      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-pretty font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Landed Cost Workspace
            </h1>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setHelpOpen(true)}
                    aria-label="Open landed cost guide"
                  />
                }
              >
                <HelpCircle aria-hidden="true" className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="top">Open landed cost guide</TooltipContent>
            </Tooltip>
          </div>
          <p className="max-w-3xl text-pretty text-xs text-muted-foreground sm:text-sm">
            Monitor shipment costing across the business. Open a shipment to record charges, review
            variant-level allocation, and finalize its inventory valuation in context.
          </p>
        </div>

        <RefreshButton
          loading={loading}
          onRefresh={() => void loadData()}
          tooltip="Refresh landed cost"
        />
      </header>

      <SupplyWorkspaceNav />

      {message ? (
        <OperationalFeedback tone="danger">
          {message} Try refreshing the workspace.
        </OperationalFeedback>
      ) : null}

      <LandedCostStats worksheets={worksheets} unstartedShipments={unstartedShipments} />

      <Tabs
        value={activeView}
        onValueChange={(value) =>
          updateQuery({ view: value === 'awaiting' ? 'awaiting' : undefined })
        }
        className="space-y-4"
      >
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto rounded-none border-b px-0"
        >
          <TabsTrigger value="worksheets" className="gap-1.5">
            <Layers3 aria-hidden="true" className="size-3.5" />
            <span>Worksheets ({worksheets.length})</span>
          </TabsTrigger>
          <TabsTrigger value="awaiting" className="gap-1.5">
            <PackageCheck aria-hidden="true" className="size-3.5" />
            <span>Awaiting Costing ({unstartedShipments.length})</span>
            {unstartedShipments.length > 0 ? (
              <span
                className="ml-1 inline-flex size-2 rounded-full bg-warning"
                aria-hidden="true"
              />
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="worksheets" className="space-y-4 pt-1">
          {loading && worksheets.length === 0 ? (
            <LoadingState message="Loading landed cost worksheets…" />
          ) : (
            <LandedCostWorksheetsTable
              worksheets={worksheets}
              searchQuery={searchQuery}
              onSearchChange={(query) => updateQuery({ q: query || undefined })}
              statusFilter={statusFilter}
              onStatusFilterChange={(status) =>
                updateQuery({ status: status === 'ALL' ? undefined : status })
              }
            />
          )}
        </TabsContent>

        <TabsContent value="awaiting" className="pt-1">
          {loading && shipments.length === 0 ? (
            <LoadingState message="Loading received shipments…" />
          ) : (
            <LandedCostUnstartedShipments
              shipments={unstartedShipments}
              canManageCost={canManageCost}
            />
          )}
        </TabsContent>
      </Tabs>

      <LandedCostHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}
