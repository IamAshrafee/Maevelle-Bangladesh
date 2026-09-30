'use client';

import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  ExternalLink,
  Filter,
  Info,
  Loader2,
  PackageCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Truck,
  User,
  Warehouse,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  InventoryDispositionBadge,
  ReturnAuthStatusBadge,
  ReturnCaseStatusBadge,
  ReturnInspectionStatusBadge,
  ReturnReceiptStatusBadge,
  ReturnTransportStatusBadge,
} from '@/components/delivery/delivery-status-badges';
import {
  AuthorizeReturnDialog,
  CancelReturnDialog,
  InspectReceiptLineDialog,
  LinkRefundDialog,
  PostReturnReceiptDialog,
  ReverseShipmentDialog,
  TransitionTransportDialog,
} from '@/components/returns/return-action-dialogs';
import { ReturnCreateDialog } from '@/components/returns/return-create-dialog';
import { RtoCreateDialog } from '@/components/returns/rto-create-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest, fetchApiData } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Data Contracts                                                             */
/* -------------------------------------------------------------------------- */

interface ReturnCaseListItem {
  id: string;
  return_number: string;
  case_type: 'CUSTOMER_RETURN' | 'RTO';
  case_status: string;
  authorization_status: string;
  transport_status: string;
  receipt_status: string;
  inspection_status: string;
  commercial_resolution_status: string;
  version: string;
  order_id: string;
  order_number: string;
  customer_name: string | null;
  reason_code: string;
  created_at: string;
}

interface ReturnCaseDetailItem extends ReturnCaseListItem {
  reason_text: string | null;
  lines: readonly {
    id: string;
    order_line_id: string;
    fulfillment_line_id: string | null;
    delivery_line_id: string | null;
    requested_quantity: string;
    authorized_quantity: string;
    received_quantity: string;
    sku: string;
    product_title: string;
  }[];
  receipts: readonly {
    id: string;
    receipt_number: string;
    status: string;
    posted_at: string;
  }[];
  receiptLines: readonly {
    id: string;
    receipt_number: string;
    version: string;
    sku: string;
    quantity: string;
    inspected_quantity: string;
    condition_code: string;
  }[];
  reverseShipments: readonly {
    id: string;
    shipment_number: string;
    provider_code: string;
    status: string;
    tracking_reference: string | null;
    created_at: string;
  }[];
  refunds: readonly {
    id: string;
    refund_id: string;
    created_at: string;
  }[];
}

interface ReturnsConsoleProps {
  initialTab?: 'customer' | 'rto' | undefined;
}

export function ReturnsConsole({ initialTab }: ReturnsConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Active Tab: Customer Returns vs RTO
  const activeTab =
    (searchParams.get('tab') as 'customer' | 'rto') ||
    initialTab ||
    'customer';

  // Selection from URL
  const selectedIdFromUrl = searchParams.get('selected');

  // State
  const [cases, setCases] = useState<readonly ReturnCaseListItem[]>([]);
  const [selectedCase, setSelectedCase] = useState<ReturnCaseDetailItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Dialog states
  const [authorizeOpen, setAuthorizeOpen] = useState(false);
  const [reverseShipmentOpen, setReverseShipmentOpen] = useState(false);
  const [transitionTransportOpen, setTransitionTransportOpen] = useState(false);
  const [postReceiptOpen, setPostReceiptOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [selectedReceiptLine, setSelectedReceiptLine] = useState<
    ReturnCaseDetailItem['receiptLines'][0] | null
  >(null);
  const [linkRefundOpen, setLinkRefundOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Sync tab change to URL
  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', val);
    params.delete('selected');
    router.replace(`${pathname}?${params.toString()}`);
  };

  // Fetch full detail for a return case
  const fetchCaseDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetchApiData<{ data: ReturnCaseDetailItem }>(`/admin/returns/${id}`);
      setSelectedCase(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load return case details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Fetch all return cases
  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApiData<{ items: readonly ReturnCaseListItem[] }>(
        '/admin/returns?pageSize=100',
      );
      const items = res?.items ?? [];
      setCases(items);

      // Auto-select case if requested in URL or select first matching
      const targetType = activeTab === 'rto' ? 'RTO' : 'CUSTOMER_RETURN';
      const typeFiltered = items.filter((c) => c.case_type === targetType);

      if (selectedIdFromUrl) {
        await fetchCaseDetail(selectedIdFromUrl);
      } else if (typeFiltered[0]) {
        await fetchCaseDetail(typeFiltered[0].id);
      } else {
        setSelectedCase(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load returns list');
    } finally {
      setLoading(false);
    }
  }, [activeTab, fetchCaseDetail, selectedIdFromUrl]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  // Select a case row
  const handleSelectCase = (caseItem: ReturnCaseListItem) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('selected', caseItem.id);
    router.replace(`${pathname}?${params.toString()}`);
    void fetchCaseDetail(caseItem.id);
  };

  // Filter cases for the active tab and search criteria
  const currentTabCases = useMemo(() => {
    const targetType = activeTab === 'rto' ? 'RTO' : 'CUSTOMER_RETURN';
    const q = searchQuery.trim().toLowerCase();

    return cases.filter((item) => {
      if (item.case_type !== targetType) return false;

      if (statusFilter !== 'ALL') {
        if (
          item.case_status !== statusFilter &&
          item.receipt_status !== statusFilter &&
          item.authorization_status !== statusFilter
        ) {
          return false;
        }
      }

      if (q) {
        const matchesNumber = item.return_number.toLowerCase().includes(q);
        const matchesOrder = item.order_number.toLowerCase().includes(q);
        const matchesCustomer = (item.customer_name || '').toLowerCase().includes(q);
        const matchesReason = item.reason_code.toLowerCase().includes(q);
        if (!matchesNumber && !matchesOrder && !matchesCustomer && !matchesReason) {
          return false;
        }
      }

      return true;
    });
  }, [cases, activeTab, statusFilter, searchQuery]);

  // Computed KPIs for active tab
  const kpis = useMemo(() => {
    const tabFiltered = cases.filter(
      (c) => c.case_type === (activeTab === 'rto' ? 'RTO' : 'CUSTOMER_RETURN'),
    );
    const openCases = tabFiltered.filter((c) => c.case_status === 'OPEN').length;
    const pendingAuth = tabFiltered.filter((c) => c.authorization_status === 'PENDING').length;
    const inTransit = tabFiltered.filter((c) => c.transport_status === 'IN_TRANSIT').length;
    const awaitingReceipt = tabFiltered.filter(
      (c) => c.receipt_status === 'NOT_RECEIVED' || c.receipt_status === 'PARTIALLY_RECEIVED',
    ).length;
    const resolved = tabFiltered.filter((c) => c.case_status === 'RESOLVED').length;

    return { total: tabFiltered.length, openCases, pendingAuth, inTransit, awaitingReceipt, resolved };
  }, [cases, activeTab]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Returns &amp; Reverse Logistics
            </h1>
            <Badge variant="outline" className="text-xs font-mono uppercase">
              {activeTab === 'rto' ? 'Return to Origin (RTO)' : 'Customer Returns'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {activeTab === 'rto'
              ? 'Track failed-delivery packages returning from carriers, physical receiving, condition inspection, and stock disposition.'
              : 'Manage buyer return requests, commercial authorizations, reverse shipments, warehouse receipts, and refund linkage.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadCases()}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {activeTab === 'customer' ? (
            <ReturnCreateDialog
              onSuccess={async (newId) => {
                setSuccessMessage('Customer Return request created successfully.');
                await loadCases();
                if (newId) await fetchCaseDetail(newId);
              }}
            />
          ) : (
            <RtoCreateDialog
              onSuccess={async (newId) => {
                setSuccessMessage('RTO case initiated from failed delivery.');
                await loadCases();
                if (newId) await fetchCaseDetail(newId);
              }}
            />
          )}
        </div>
      </div>

      {/* Tabs for Customer Returns vs RTO */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="customer" className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Customer Returns
          </TabsTrigger>
          <TabsTrigger value="rto" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Return to Origin (RTO)
          </TabsTrigger>
        </TabsList>

        {/* Global Notifications */}
        {successMessage && (
          <Alert className="bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 border-emerald-500/20">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription className="text-sm">{successMessage}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* KPI Stats Bar */}
        <Stats>
          <StatsCard>
            <StatsTitle>Total Cases</StatsTitle>
            <StatsValue>{kpis.total}</StatsValue>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Open Cases</StatsTitle>
            <StatsValue>{kpis.openCases}</StatsValue>
          </StatsCard>
          <StatsCard>
            <StatsTitle>
              {activeTab === 'customer' ? 'Awaiting Authorization' : 'In Reverse Transit'}
            </StatsTitle>
            <StatsValue>
              {activeTab === 'customer' ? kpis.pendingAuth : kpis.inTransit}
            </StatsValue>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Awaiting Physical Receipt</StatsTitle>
            <StatsValue>{kpis.awaitingReceipt}</StatsValue>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Resolved / Completed</StatsTitle>
            <StatsValue>{kpis.resolved}</StatsValue>
          </StatsCard>
        </Stats>

        {/* Worklist & Detail Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Worklist Table (7 cols) */}
          <Card className="lg:col-span-7 overflow-hidden border">
            <CardHeader className="p-4 border-b bg-muted/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {activeTab === 'rto' ? 'RTO Worklist' : 'Customer Returns Worklist'}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Showing {currentTabCases.length} records
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-48 sm:w-56">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search return #, order…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={(val) => val && setStatusFilter(val)}>
                    <SelectTrigger className="h-8 text-xs w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Statuses</SelectItem>
                      <SelectItem value="OPEN">Open</SelectItem>
                      <SelectItem value="PENDING">Pending Auth</SelectItem>
                      <SelectItem value="AUTHORIZED">Authorized</SelectItem>
                      <SelectItem value="NOT_RECEIVED">Not Received</SelectItem>
                      <SelectItem value="PARTIALLY_RECEIVED">Partial Receipt</SelectItem>
                      <SelectItem value="RECEIVED">Received</SelectItem>
                      <SelectItem value="RESOLVED">Resolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs">Loading returns worklist…</p>
                </div>
              ) : currentTabCases.length === 0 ? (
                <div className="p-12 text-center text-muted-foreground space-y-2">
                  <RotateCcw className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm font-medium">No matching return records found</p>
                  <p className="text-xs max-w-sm mx-auto">
                    {activeTab === 'rto'
                      ? 'No RTO cases exist for the current filter. Initiate an RTO from a failed delivery above.'
                      : 'No customer return requests found. Create a return request to begin receiving.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {currentTabCases.map((item) => {
                    const isSelected = selectedCase?.id === item.id;
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectCase(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleSelectCase(item);
                          }
                        }}
                        className={`p-3.5 transition-colors cursor-pointer text-left block w-full hover:bg-muted/50 ${
                          isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-foreground">
                                #{item.return_number}
                              </span>
                              <ReturnCaseStatusBadge status={item.case_status} />
                              {activeTab === 'customer' && (
                                <ReturnAuthStatusBadge status={item.authorization_status} />
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span>Order: #{item.order_number}</span>
                              <span>•</span>
                              <span>{item.customer_name || 'Guest Buyer'}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            <ReturnReceiptStatusBadge status={item.receipt_status} />
                            <span className="text-[11px] text-muted-foreground">
                              {item.reason_code.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right Column: Case Operational Detail Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {detailLoading ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
                <p className="text-xs">Loading return case details…</p>
              </Card>
            ) : !selectedCase ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Boxes className="h-8 w-8 mx-auto opacity-40 mb-2" />
                <p className="text-sm font-medium">Select a Return Case</p>
                <p className="text-xs mt-1">
                  Click any case in the list to manage authorization, reverse transit, warehouse
                  receipts, and condition inspection.
                </p>
              </Card>
            ) : (
              <>
                {/* Header & Quick Action Card */}
                <Card>
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">#{selectedCase.return_number}</CardTitle>
                          <ReturnCaseStatusBadge status={selectedCase.case_status} />
                        </div>
                        <CardDescription className="text-xs mt-1">
                          Created {new Date(selectedCase.created_at).toLocaleDateString()} · Version{' '}
                          {selectedCase.version}
                        </CardDescription>
                      </div>

                      {/* State-aware primary action button */}
                      <div className="flex items-center gap-2">
                        {selectedCase.case_status === 'OPEN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() => setCancelOpen(true)}
                          >
                            Cancel Case
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4 text-xs">
                    {/* Operational Status Matrix */}
                    <div className="grid grid-cols-2 gap-2 p-3 bg-muted/30 rounded-lg border">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">
                          Authorization:
                        </span>
                        <ReturnAuthStatusBadge status={selectedCase.authorization_status} />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">
                          Reverse Transport:
                        </span>
                        <ReturnTransportStatusBadge status={selectedCase.transport_status} />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">
                          Physical Receipt:
                        </span>
                        <ReturnReceiptStatusBadge status={selectedCase.receipt_status} />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">
                          Inspection &amp; Stock:
                        </span>
                        <ReturnInspectionStatusBadge status={selectedCase.inspection_status} />
                      </div>
                    </div>

                    {/* Operational Action Bar */}
                    <div className="space-y-2">
                      <p className="font-semibold text-foreground text-xs">Available Actions</p>
                      <div className="flex flex-wrap gap-2">
                        {/* Customer Return Authorization */}
                        {selectedCase.case_type === 'CUSTOMER_RETURN' &&
                          selectedCase.authorization_status === 'PENDING' && (
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => setAuthorizeOpen(true)}
                            >
                              <PackageCheck className="h-3.5 w-3.5 mr-1.5" />
                              Authorize Return
                            </Button>
                          )}

                        {/* Reverse Transport Book / Update */}
                        {selectedCase.transport_status !== 'ARRIVED' &&
                          selectedCase.transport_status !== 'LOST' && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => setReverseShipmentOpen(true)}
                              >
                                <Truck className="h-3.5 w-3.5 mr-1.5" />
                                Reverse Carrier
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => setTransitionTransportOpen(true)}
                              >
                                Transit Update
                              </Button>
                            </>
                          )}

                        {/* Post Warehouse Receipt */}
                        {selectedCase.receipt_status !== 'RECEIVED' && (
                          <Button
                            size="sm"
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => setPostReceiptOpen(true)}
                          >
                            <Warehouse className="h-3.5 w-3.5 mr-1.5" />
                            Post Physical Receipt
                          </Button>
                        )}

                        {/* Link Finance Refund */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => setLinkRefundOpen(true)}
                        >
                          <DollarSign className="h-3.5 w-3.5 mr-1.5 text-primary" />
                          Link Refund
                        </Button>
                      </div>
                    </div>

                    {/* Return Details */}
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Original Order:</span>
                        <Link
                          href={`/orders?search=${selectedCase.order_number}`}
                          className="font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          #{selectedCase.order_number}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Buyer:</span>
                        <span className="font-medium text-foreground">
                          {selectedCase.customer_name || 'Guest Buyer'}
                        </span>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Return Reason:</span>
                        <span className="font-medium text-foreground">
                          {selectedCase.reason_code.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {selectedCase.reason_text && (
                        <div className="bg-muted/40 p-2.5 rounded text-[11px] text-muted-foreground mt-1">
                          <strong className="text-foreground block mb-0.5">Customer Note:</strong>
                          {selectedCase.reason_text}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Return Line Items Card */}
                <Card>
                  <CardHeader className="py-3 px-4 border-b">
                    <CardTitle className="text-sm font-semibold">Authorized Return Lines</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 divide-y divide-border">
                    {selectedCase.lines.map((line) => (
                      <div key={line.id} className="p-3 text-xs flex justify-between items-center">
                        <div className="min-w-0 pr-2">
                          <p className="font-medium text-foreground truncate">{line.product_title}</p>
                          <p className="text-muted-foreground font-mono text-[11px]">{line.sku}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="font-mono">
                            Requested: <strong>{line.requested_quantity}</strong>
                          </p>
                          <p className="font-mono text-muted-foreground text-[11px]">
                            Auth: {line.authorized_quantity} · Recv: {line.received_quantity}
                          </p>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Inspection & Disposition Card */}
                <Card>
                  <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        Inspection &amp; Stock Disposition
                      </CardTitle>
                      <CardDescription className="text-[11px]">
                        Condition assessment determining sellable vs damaged stock
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {selectedCase.receiptLines.length === 0 ? (
                      <div className="p-4 text-center text-xs text-muted-foreground">
                        No physical receipts posted yet. Post a receipt to begin condition
                        inspection.
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {selectedCase.receiptLines.map((rLine) => {
                          const total = Number(rLine.quantity) || 0;
                          const inspected = Number(rLine.inspected_quantity) || 0;
                          const remaining = Math.max(0, total - inspected);

                          return (
                            <div
                              key={rLine.id}
                              className="p-3 text-xs flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-medium">{rLine.sku}</span>
                                  {rLine.condition_code && (
                                    <InventoryDispositionBadge
                                      outcome={rLine.condition_code}
                                    />
                                  )}
                                </div>
                                <p className="text-muted-foreground text-[11px] mt-0.5">
                                  Receipt #{rLine.receipt_number} · Inspected {inspected} of {total}
                                </p>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {remaining > 0 ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
                                    onClick={() => {
                                      setSelectedReceiptLine(rLine);
                                      setInspectOpen(true);
                                    }}
                                  >
                                    Inspect ({remaining} left)
                                  </Button>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]"
                                  >
                                    Fully Inspected
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Reverse Shipments & Tracking Card */}
                {selectedCase.reverseShipments.length > 0 && (
                  <Card>
                    <CardHeader className="py-3 px-4 border-b">
                      <CardTitle className="text-sm font-semibold">Reverse Courier Tracking</CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                      {selectedCase.reverseShipments.map((shipment) => (
                        <div
                          key={shipment.id}
                          className="flex items-center justify-between text-xs p-2.5 rounded-lg border bg-muted/20"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="font-mono text-[10px]">
                                {shipment.provider_code}
                              </Badge>
                              <span className="font-mono font-medium">
                                {shipment.tracking_reference || shipment.shipment_number}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Status: {shipment.status} · Booked{' '}
                              {new Date(shipment.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ReturnTransportStatusBadge status={shipment.status} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Refunds Relationship Card */}
                <Card>
                  <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold">Finance &amp; Refunds</CardTitle>
                      <CardDescription className="text-[11px]">
                        Linked payments refund transactions
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-primary"
                      onClick={() => setLinkRefundOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Link Refund
                    </Button>
                  </CardHeader>
                  <CardContent className="p-3">
                    {selectedCase.refunds.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        No refund linked to this return case.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selectedCase.refunds.map((ref) => (
                          <div
                            key={ref.id}
                            className="flex items-center justify-between text-xs p-2.5 rounded-md border bg-card"
                          >
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4 text-emerald-600" />
                              <div>
                                <span className="font-mono font-medium text-foreground">
                                  Refund ID: {ref.refund_id.slice(0, 12)}…
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                  Linked {new Date(ref.created_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className="text-[10px] text-emerald-700 dark:text-emerald-300"
                            >
                              Linked
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </Tabs>

      {/* Action Dialogs */}
      {selectedCase && (
        <>
          <AuthorizeReturnDialog
            returnCase={selectedCase}
            open={authorizeOpen}
            onOpenChange={setAuthorizeOpen}
            onSuccess={async () => {
              setSuccessMessage('Return case authorized.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <ReverseShipmentDialog
            returnCase={selectedCase}
            open={reverseShipmentOpen}
            onOpenChange={setReverseShipmentOpen}
            onSuccess={async () => {
              setSuccessMessage('Reverse shipment recorded.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <TransitionTransportDialog
            returnCase={selectedCase}
            open={transitionTransportOpen}
            onOpenChange={setTransitionTransportOpen}
            onSuccess={async () => {
              setSuccessMessage('Reverse transport status updated.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <PostReturnReceiptDialog
            returnCase={selectedCase}
            open={postReceiptOpen}
            onOpenChange={setPostReceiptOpen}
            onSuccess={async () => {
              setSuccessMessage('Physical return receipt posted into inspection.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <InspectReceiptLineDialog
            receiptLine={selectedReceiptLine}
            open={inspectOpen}
            onOpenChange={setInspectOpen}
            onSuccess={async () => {
              setSuccessMessage('Condition inspection and inventory disposition posted.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <LinkRefundDialog
            returnCase={selectedCase}
            open={linkRefundOpen}
            onOpenChange={setLinkRefundOpen}
            onSuccess={async () => {
              setSuccessMessage('Refund linked to return case.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />

          <CancelReturnDialog
            returnCase={selectedCase}
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            onSuccess={async () => {
              setSuccessMessage('Return case cancelled.');
              await loadCases();
              await fetchCaseDetail(selectedCase.id);
            }}
          />
        </>
      )}
    </div>
  );
}
