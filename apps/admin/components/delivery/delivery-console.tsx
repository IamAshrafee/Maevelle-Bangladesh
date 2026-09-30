'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  HelpCircle,
  Info,
  Loader2,
  MapPin,
  PackageCheck,
  PackageX,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  Route,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  User,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchApiData } from '@/lib/api';
import type {
  CourierAccountDto,
  CustomerDeliveryHistoryDto,
  DeliveryClaimDto,
  DeliveryDto,
  DeliveryFinancialObservationDto,
} from '@maevelle/contracts';

import { CustomerDeliveryRiskCard } from './customer-delivery-risk-card';
import {
  OpenClaimDialog,
  RecordDeliveryAttemptDialog,
  ReconcileUnknownBookingDialog,
  ResolveExceptionDialog,
  TransitionClaimDialog,
} from './delivery-actions-dialogs';
import {
  DeliveryOutcomeBadge,
  DeliveryStatusBadge,
} from './delivery-status-badges';
import { ManualBookingDialog } from './manual-booking-dialog';
import { PathaoBookingDialog } from './pathao-booking-dialog';
import { TrackingTimeline } from './tracking-timeline';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-BD', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return value;
  }
}

function formatMoney(amount?: string | number | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 2,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function DeliveryConsole() {
  const searchParams = useSearchParams();
  const urlSelected = searchParams.get('selected');
  const urlQuery = searchParams.get('q') || searchParams.get('search');
  const urlStatus = searchParams.get('status');

  const [deliveries, setDeliveries] = useState<readonly DeliveryDto[]>([]);
  const [courierAccounts, setCourierAccounts] = useState<readonly CourierAccountDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(urlSelected ?? undefined);
  const [customerHistory, setCustomerHistory] = useState<CustomerDeliveryHistoryDto | null>(null);
  const [financialObs, setFinancialObs] = useState<readonly DeliveryFinancialObservationDto[]>([]);
  const [query, setQuery] = useState(urlQuery ?? '');
  const [statusFilter, setStatusFilter] = useState(urlStatus ?? 'ALL');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(null);

  // Dialog States
  const [pathaoDialogOpen, setPathaoDialogOpen] = useState(false);
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [attemptDialogOpen, setAttemptDialogOpen] = useState(false);
  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [resolveExceptionId, setResolveExceptionId] = useState<string | null>(null);
  const [openClaimModal, setOpenClaimModal] = useState(false);
  const [transitioningClaim, setTransitioningClaim] = useState<DeliveryClaimDto | null>(null);

  const reload = useCallback(async () => {
    try {
      const [dResult, accountsResult] = await Promise.all([
        fetchApiData<readonly DeliveryDto[]>('/admin/deliveries?pageSize=100'),
        fetchApiData<readonly CourierAccountDto[]>('/admin/deliveries/courier-accounts'),
      ]);
      const list = dResult || [];
      setDeliveries(list);
      setCourierAccounts(accountsResult || []);

      setSelectedId((current) => {
        if (urlSelected && list.some((d) => d.id === urlSelected)) return urlSelected;
        if (current && list.some((d) => d.id === current)) return current;
        return list[0]?.id;
      });
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Unable to load delivery operations.',
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [urlSelected]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(
    () => deliveries.find((d) => d.id === selectedId),
    [deliveries, selectedId],
  );

  // Fetch contextual customer history & financial observations for selected delivery
  useEffect(() => {
    if (!selectedId) {
      setCustomerHistory(null);
      setFinancialObs([]);
      return;
    }
    let current = true;
    void Promise.all([
      fetchApiData<CustomerDeliveryHistoryDto>(
        `/admin/deliveries/${selectedId}/customer-delivery-history`,
      ).catch(() => null),
      fetchApiData<{ observations?: readonly DeliveryFinancialObservationDto[] }>(
        `/admin/deliveries/${selectedId}/financial-observations`,
      ).catch(() => ({ observations: [] })),
    ]).then(([history, fin]) => {
      if (current) {
        setCustomerHistory(history);
        setFinancialObs(fin?.observations ?? []);
      }
    });

    return () => {
      current = false;
    };
  }, [selectedId]);

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    return deliveries.filter((item) => {
      const matchesStatus = statusFilter === 'ALL' || item.operationalStatus === statusFilter;
      const matchesSearch =
        !term ||
        item.deliveryNumber.toLowerCase().includes(term) ||
        item.orderNumber.toLowerCase().includes(term) ||
        item.fulfillmentNumber.toLowerCase().includes(term) ||
        item.recipient.name.toLowerCase().includes(term) ||
        item.recipient.phone.toLowerCase().includes(term) ||
        (item.manualCarrierName && item.manualCarrierName.toLowerCase().includes(term)) ||
        (item.trackingReference && item.trackingReference.toLowerCase().includes(term)) ||
        (item.activeBooking?.trackingNumber &&
          item.activeBooking.trackingNumber.toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [deliveries, query, statusFilter]);

  // Operational metrics
  const needsBookingCount = deliveries.filter((d) => d.operationalStatus === 'READY').length;
  const inTransitCount = deliveries.filter((d) =>
    ['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(d.operationalStatus),
  ).length;
  const failuresCount = deliveries.filter((d) =>
    ['FAILED', 'RTO_INITIATED', 'RETURNING'].includes(d.operationalStatus),
  ).length;

  // Simple state commands
  const handleSimpleAction = async (
    delivery: DeliveryDto,
    act: 'dispatch' | 'delivered' | 'failed',
  ) => {
    const confirmation =
      act === 'delivered'
        ? 'Confirm customer delivery? This recognizes COGS and records an immutable delivery outcome.'
        : act === 'failed'
          ? 'Mark this delivery as failed? This unlocks Return-to-Origin (RTO) reverse logistics.'
          : 'Confirm physical handover to the carrier?';
    if (!window.confirm(confirmation)) return;

    setBusy(true);
    setFeedback(null);
    try {
      const body =
        act === 'failed'
          ? { version: delivery.version, reasonCode: 'CARRIER_DELIVERY_FAILED' }
          : { version: delivery.version };
      await fetchApiData(`/admin/deliveries/${delivery.id}/${act}`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setFeedback({
        message: `Delivery ${act} command completed successfully.`,
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'The delivery command was rejected.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelBooking = async (delivery: DeliveryDto) => {
    const reason = window.prompt(
      'Enter a cancellation reason for this courier booking:',
      'Operator rebooking',
    );
    if (!reason) return;
    setBusy(true);
    setFeedback(null);
    try {
      await fetchApiData(`/admin/deliveries/${delivery.id}/cancel-booking`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: delivery.version, reason }),
      });
      setFeedback({
        message: 'Courier booking cancelled. Delivery is ready for rebooking.',
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Could not cancel courier booking.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleInitiateRto = async (delivery: DeliveryDto) => {
    if (
      !window.confirm(
        'Initiate Return-to-Origin (RTO) for this failed delivery? Reverse transport tracking will begin in Returns.',
      )
    ) {
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await fetchApiData(`/admin/deliveries/${delivery.id}/initiate-rto`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      setFeedback({
        message: 'RTO initiated successfully. You can now monitor reverse transport in Returns & RTO.',
        tone: 'success',
      });
      await reload();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Could not initiate RTO.',
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };

  const activeException = selected?.exceptions.find((ex) => ex.id === resolveExceptionId);

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Operations / Logistics
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Deliveries</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Book couriers, record physical handover, trace carrier milestones, manage exceptions, and handle RTO.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            render={<Link href="/fulfillments" />}
            variant="outline"
            className="gap-1.5"
          >
            <Boxes className="size-4" /> Open Fulfillments
          </Button>
          <Button
            render={<Link href="/returns?tab=rto" />}
            variant="outline"
            className="gap-1.5"
          >
            <RotateCcw className="size-4" /> Open RTO Queue
          </Button>
          <Button
            render={<Link href="/delivery/couriers" />}
            variant="outline"
            className="gap-1.5"
          >
            <Truck className="size-4" /> Couriers & Accounts
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void reload()}
            title="Refresh"
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Operational Stats Cards */}
      <Stats>
        <StatsCard>
          <StatsTitle>All Deliveries</StatsTitle>
          <StatsValue>{deliveries.length}</StatsValue>
          <StatsDescription>Current tenant shipments</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Needs Booking</StatsTitle>
          <StatsValue>{needsBookingCount}</StatsValue>
          <StatsDescription>Ready for courier assignment</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>In Transit</StatsTitle>
          <StatsValue>{inTransitCount}</StatsValue>
          <StatsDescription>Moving to customer</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Failures & RTO</StatsTitle>
          <StatsValue>{failuresCount}</StatsValue>
          <StatsDescription>Requires return processing</StatsDescription>
        </StatsCard>
      </Stats>

      {/* Feedback Banner */}
      {feedback ? (
        <div
          className={`rounded-lg border p-3 text-xs flex items-center justify-between gap-2 ${
            feedback.tone === 'success'
              ? 'border-emerald-500/20 bg-emerald-50/50 text-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.tone === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Search & Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2 min-w-64 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search delivery #, order #, recipient, carrier, tracking…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          <select
            className="rounded-md border bg-background px-2.5 py-1 text-xs focus:ring-2 focus:ring-primary"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses ({deliveries.length})</option>
            <option value="READY">Needs Booking</option>
            <option value="BOOKING">Booking</option>
            <option value="BOOKED">Booked</option>
            <option value="HANDED_OVER">Handed Over</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Delivery Failed</option>
            <option value="RTO_INITIATED">RTO Initiated</option>
            <option value="RETURNING">Returning</option>
            <option value="RETURNED_TO_ORIGIN">Returned to Origin</option>
            <option value="LOST">Lost</option>
            <option value="DAMAGED">Damaged</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Workspace Grid (Table on left, Detail panel on right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Table Column */}
        <div className={selected ? 'lg:col-span-7' : 'lg:col-span-12'}>
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Loader2 className="size-5 animate-spin mr-2" /> Loading deliveries…
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <Truck className="size-8 opacity-20 mb-2" />
                <p className="text-sm font-medium">No matching deliveries found.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Prepare a delivery from a packed fulfillment in Fulfillments.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delivery / Fulfillment</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Carrier & Tracking</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>COD</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const isSelected = item.id === selectedId;
                    const carrier =
                      item.manualCarrierName ||
                      item.activeBooking?.providerCode ||
                      'Unassigned';
                    const tracking =
                      item.trackingReference ||
                      item.activeBooking?.trackingNumber ||
                      item.activeBooking?.status ||
                      '—';

                    return (
                      <TableRow
                        key={item.id}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-primary/5 font-medium' : 'hover:bg-muted/40'
                        }`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <TableCell>
                          <span className="font-semibold text-foreground">
                            {item.deliveryNumber}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {item.fulfillmentNumber}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/orders/${item.orderId}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {item.orderNumber}
                            <ExternalLink className="size-2.5 opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">
                          <p className="font-medium text-foreground">{item.recipient.name}</p>
                          <p className="text-[11px] text-muted-foreground font-mono">
                            {item.recipient.phone}
                          </p>
                        </TableCell>
                        <TableCell className="text-xs">
                          <p className="font-medium text-foreground">{carrier}</p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate max-w-32">
                            {tracking}
                          </p>
                        </TableCell>
                        <TableCell>
                          <DeliveryStatusBadge status={item.operationalStatus} />
                          <DeliveryOutcomeBadge outcome={item.outcomeStatus} />
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {item.cod.required
                            ? `${item.cod.expectedAmount} ৳`
                            : <span className="text-muted-foreground text-[11px]">Prepaid</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant={isSelected ? 'default' : 'ghost'}
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedId(item.id);
                            }}
                          >
                            Detail
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* Detail Panel Column */}
        {selected ? (
          <div className="lg:col-span-5 space-y-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      Shipment Details
                    </span>
                    <CardTitle className="text-lg font-bold flex flex-wrap items-center gap-2 mt-0.5">
                      {selected.deliveryNumber}
                      <DeliveryStatusBadge status={selected.operationalStatus} />
                      <DeliveryOutcomeBadge outcome={selected.outcomeStatus} />
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setSelectedId(undefined)}
                    className="h-7 px-2 text-muted-foreground"
                  >
                    Close
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-4 text-xs">
                {/* 1. Recipient & Destination Card */}
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                      <User className="size-3.5 text-primary" /> Recipient
                    </span>
                    <a
                      href={`tel:${selected.recipient.phone}`}
                      className="text-[11px] text-primary hover:underline flex items-center gap-1 font-mono"
                    >
                      <Phone className="size-3" /> {selected.recipient.phone}
                    </a>
                  </div>
                  <p className="font-medium text-foreground">{selected.recipient.name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1">
                    <MapPin className="size-3 shrink-0 mt-0.5 text-muted-foreground" />
                    <span>{selected.recipient.address}</span>
                  </p>
                </div>

                {/* 2. Commercial & Financial Card */}
                <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                  <div>
                    <span className="text-muted-foreground text-[11px]">Commercial Order:</span>
                    <p className="font-semibold mt-0.5">
                      <Link
                        href={`/orders/${selected.orderId}`}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {selected.orderNumber}
                        <ExternalLink className="size-3" />
                      </Link>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Fulfillment:</span>
                    <p className="font-semibold mt-0.5">
                      <Link
                        href={`/fulfillments?selected=${selected.fulfillmentId}`}
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {selected.fulfillmentNumber}
                        <ExternalLink className="size-3" />
                      </Link>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">COD to Collect:</span>
                    <p className="font-bold text-foreground mt-0.5">
                      {selected.cod.required
                        ? `${selected.cod.expectedAmount} ${selected.cod.currency}`
                        : '0 ৳ (Prepaid)'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[11px]">Carrier / Consignment:</span>
                    <p className="font-semibold text-foreground mt-0.5 truncate">
                      {selected.manualCarrierName ||
                        selected.activeBooking?.providerCode ||
                        'Unassigned'}
                    </p>
                  </div>
                </div>

                {/* 3. Carrier Booking & Reconcile Controls */}
                {selected.operationalStatus === 'READY' ? (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <div>
                      <p className="font-semibold text-primary flex items-center gap-1.5 text-xs">
                        <Truck className="size-3.5" /> Courier Booking Required
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Choose between automated Pathao booking (with instant consignment & tracking) or record an offline carrier.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => setPathaoDialogOpen(true)}
                        className="gap-1.5"
                      >
                        <Truck className="size-3.5" /> Book with Pathao
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setManualDialogOpen(true)}
                        className="gap-1.5"
                      >
                        Record Manual Carrier
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Unknown Outcome Reconciliation Card */}
                {selected.operationalStatus === 'BOOKING' &&
                selected.activeBooking?.status === 'UNKNOWN_OUTCOME' ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <HelpCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-amber-900 dark:text-amber-300 text-xs">
                          Provider Outcome Reconciling / Unknown
                        </p>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-400 mt-0.5">
                          The courier server timed out or returned an ambiguous status. To prevent duplicate parcels, check your courier portal before taking action.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReconcileDialogOpen(true)}
                      className="gap-1.5 w-fit"
                    >
                      Reconcile Booking Outcome
                    </Button>
                  </div>
                ) : null}

                {/* Booked -> Handover Next Action */}
                {selected.operationalStatus === 'BOOKED' ? (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-50/50 dark:bg-sky-950/20 p-3 space-y-2">
                    <div>
                      <p className="font-semibold text-sky-900 dark:text-sky-300 flex items-center gap-1.5 text-xs">
                        <PackageCheck className="size-3.5" /> Consignment Booked — Awaiting Handover
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Consignment #{' '}
                        <strong className="font-mono text-foreground">
                          {selected.activeBooking?.externalConsignmentId ||
                            selected.trackingReference ||
                            '—'}
                        </strong>
                        . Confirm physical handover to rider once handed over.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void handleSimpleAction(selected, 'dispatch')}
                        className="gap-1.5"
                      >
                        <Truck className="size-3.5" /> Record Handover to Carrier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void handleCancelBooking(selected)}
                        className="gap-1.5"
                      >
                        Cancel Booking
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* In Transit -> Terminal Outcome Controls */}
                {['HANDED_OVER', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(
                  selected.operationalStatus,
                ) ? (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <p className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                      <Route className="size-3.5 text-primary" /> Delivery Progress Actions
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={busy}
                        onClick={() => void handleSimpleAction(selected, 'delivered')}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <CheckCircle2 className="size-3.5" /> Mark Delivered
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setAttemptDialogOpen(true)}
                        className="gap-1.5"
                      >
                        <Clock className="size-3.5" /> Log Attempt
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void handleSimpleAction(selected, 'failed')}
                        className="gap-1.5"
                      >
                        <XCircle className="size-3.5" /> Mark Delivery Failed
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Delivery Failed -> Initiate RTO Banner */}
                {selected.operationalStatus === 'FAILED' ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-50/50 dark:bg-rose-950/20 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-rose-900 dark:text-rose-300 text-xs">
                          Delivery Failed — Ready for RTO
                        </p>
                        <p className="text-[11px] text-rose-800/80 dark:text-rose-400 mt-0.5">
                          Initiate Return-to-Origin to track the physical reverse parcel back to the warehouse for inspection and restocking.
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void handleInitiateRto(selected)}
                      className="gap-1.5"
                    >
                      <RotateCcw className="size-3.5" /> Initiate RTO (Return to Origin)
                    </Button>
                  </div>
                ) : null}

                {/* RTO In Progress Link */}
                {['RTO_INITIATED', 'RETURNING', 'RETURNED_TO_ORIGIN'].includes(
                  selected.operationalStatus,
                ) ? (
                  <div className="rounded-lg border border-purple-500/20 bg-purple-50/50 dark:bg-purple-950/20 p-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="size-4 text-purple-600 shrink-0" />
                      <div>
                        <p className="font-semibold text-purple-900 dark:text-purple-300 text-xs">
                          RTO Reverse Logistics Active
                        </p>
                        <p className="text-[11px] text-purple-800/80 dark:text-purple-400">
                          Reverse parcel is returning. Warehouse receipt and inspection are managed in Returns.
                        </p>
                      </div>
                    </div>
                    <Button
                      render={<Link href={`/returns?tab=rto&search=${selected.deliveryNumber}`} />}
                      size="xs"
                      variant="outline"
                      className="shrink-0 gap-1"
                    >
                      Open RTO <ArrowRight className="size-3" />
                    </Button>
                  </div>
                ) : null}

                {/* Structured Tabs: Tracking Timeline / Exceptions & Claims / Financial / Risk */}
                <Tabs defaultValue="timeline" className="pt-2">
                  <TabsList className="w-full grid grid-cols-4 h-8 text-xs">
                    <TabsTrigger value="timeline" className="text-[11px]">
                      Timeline
                    </TabsTrigger>
                    <TabsTrigger value="exceptions" className="text-[11px]">
                      Exceptions ({selected.exceptions.length + selected.claims.length})
                    </TabsTrigger>
                    <TabsTrigger value="risk" className="text-[11px]">
                      Buyer Risk
                    </TabsTrigger>
                    <TabsTrigger value="finance" className="text-[11px]">
                      Finance
                    </TabsTrigger>
                  </TabsList>

                  {/* Tab 1: Tracking & Attempts */}
                  <TabsContent value="timeline" className="pt-3 space-y-3">
                    <TrackingTimeline
                      events={selected.events}
                      attempts={selected.attempts}
                    />
                  </TabsContent>

                  {/* Tab 2: Exceptions & Claims */}
                  <TabsContent value="exceptions" className="pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-foreground">
                        Exceptions & Claims
                      </span>
                      {['LOST', 'DAMAGED', 'FAILED'].includes(selected.operationalStatus) ||
                      selected.exceptions.length > 0 ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setOpenClaimModal(true)}
                          className="gap-1 text-[11px]"
                        >
                          <ShieldAlert className="size-3 text-rose-600" /> Open Claim
                        </Button>
                      ) : null}
                    </div>

                    {/* Open Exceptions */}
                    {selected.exceptions.length === 0 && selected.claims.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        No delivery exceptions or claims recorded for this shipment.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {selected.exceptions.map((ex) => (
                          <div
                            key={ex.id}
                            className="rounded-lg border bg-card p-3 space-y-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant="destructive" className="text-[10px]">
                                {ex.type.replaceAll('_', ' ')}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(ex.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-foreground">{ex.summary}</p>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setResolveExceptionId(ex.id)}
                              className="mt-1"
                            >
                              Resolve Exception
                            </Button>
                          </div>
                        ))}

                        {/* Claims */}
                        {selected.claims.map((claim) => (
                          <div
                            key={claim.id}
                            className="rounded-lg border bg-card p-3 space-y-1.5 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold font-mono text-xs">
                                {claim.claimNumber}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">
                                {claim.status}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Reason: <strong className="text-foreground">{claim.reason}</strong> · Claimed:{' '}
                              <strong>{formatMoney(claim.claimedAmount, claim.currency)}</strong>
                              {claim.approvedAmount ? (
                                <>
                                  {' '}· Approved: <strong className="text-emerald-600">{formatMoney(claim.approvedAmount, claim.currency)}</strong>
                                </>
                              ) : null}
                            </p>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setTransitioningClaim(claim)}
                            >
                              Update Status
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Tab 3: Buyer Reliability & Delivery Risk */}
                  <TabsContent value="risk" className="pt-3">
                    <CustomerDeliveryRiskCard
                      history={customerHistory}
                      customerName={selected.recipient.name}
                      phone={selected.recipient.phone}
                    />
                  </TabsContent>

                  {/* Tab 4: Financial & Settlement Observations */}
                  <TabsContent value="finance" className="pt-3 space-y-3">
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
                      <p className="font-semibold text-xs flex items-center gap-1.5">
                        <Receipt className="size-3.5 text-primary" /> COD Financial Evidence
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t text-[11px]">
                        <div>
                          <span className="text-muted-foreground">Expected COD:</span>
                          <p className="font-bold text-foreground">
                            {selected.cod.required
                              ? `${selected.cod.expectedAmount} ${selected.cod.currency}`
                              : '0 ৳'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Finance Status:</span>
                          <p className="font-medium text-foreground">
                            {selected.operationalStatus === 'DELIVERED'
                              ? 'Delivered · Awaiting Carrier Remittance'
                              : 'Pending Delivery'}
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground pt-1 border-t">
                        Carrier delivery confirmations do not automatically post to Finance cash accounts. Remittances and COD settlements are recorded authoritatively in Payments & Finance.
                      </p>
                    </div>

                    {financialObs.length > 0 ? (
                      <div className="space-y-1.5">
                        <h5 className="font-semibold text-xs text-foreground">
                          Recorded Provider Observations ({financialObs.length})
                        </h5>
                        <div className="rounded-lg border divide-y overflow-hidden text-[11px]">
                          {financialObs.map((obs) => (
                            <div key={obs.id} className="p-2.5 flex items-center justify-between">
                              <div>
                                <span className="font-semibold">{obs.type}</span>
                                {obs.chargeType ? ` (${obs.chargeType})` : ''}
                                <span className="block text-[10px] text-muted-foreground">
                                  {formatDate(obs.occurredAt)}
                                </span>
                              </div>
                              <span className="font-mono font-bold">
                                {formatMoney(obs.amount, obs.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Dialog Modals */}
      {selected ? (
        <>
          <PathaoBookingDialog
            open={pathaoDialogOpen}
            onOpenChange={setPathaoDialogOpen}
            deliveryId={selected.id}
            version={selected.version}
            deliveryNumber={selected.deliveryNumber}
            recipient={selected.recipient}
            cod={selected.cod}
            courierAccounts={courierAccounts}
            onSuccess={async () => {
              setFeedback({
                message: 'Pathao booking requested successfully. Worker will track consignment.',
                tone: 'success',
              });
              await reload();
            }}
          />

          <ManualBookingDialog
            open={manualDialogOpen}
            onOpenChange={setManualDialogOpen}
            deliveryId={selected.id}
            version={selected.version}
            deliveryNumber={selected.deliveryNumber}
            onSuccess={async () => {
              setFeedback({
                message: 'Manual carrier booking recorded successfully.',
                tone: 'success',
              });
              await reload();
            }}
          />

          <RecordDeliveryAttemptDialog
            open={attemptDialogOpen}
            onOpenChange={setAttemptDialogOpen}
            deliveryId={selected.id}
            version={selected.version}
            deliveryNumber={selected.deliveryNumber}
            onSuccess={async () => {
              setFeedback({
                message: 'Delivery attempt logged successfully.',
                tone: 'success',
              });
              await reload();
            }}
          />

          {selected.activeBooking ? (
            <ReconcileUnknownBookingDialog
              open={reconcileDialogOpen}
              onOpenChange={setReconcileDialogOpen}
              deliveryId={selected.id}
              version={selected.version}
              deliveryNumber={selected.deliveryNumber}
              activeBookingId={selected.activeBooking.id}
              onSuccess={async () => {
                setFeedback({
                  message: 'Booking outcome successfully reconciled.',
                  tone: 'success',
                });
                await reload();
              }}
            />
          ) : null}

          {activeException ? (
            <ResolveExceptionDialog
              open={Boolean(resolveExceptionId)}
              onOpenChange={(op) => {
                if (!op) setResolveExceptionId(null);
              }}
              deliveryId={selected.id}
              version={selected.version}
              exceptionId={activeException.id}
              exceptionSummary={activeException.summary}
              onSuccess={async () => {
                setFeedback({
                  message: 'Exception resolved.',
                  tone: 'success',
                });
                setResolveExceptionId(null);
                await reload();
              }}
            />
          ) : null}

          <OpenClaimDialog
            open={openClaimModal}
            onOpenChange={setOpenClaimModal}
            deliveryId={selected.id}
            version={selected.version}
            deliveryNumber={selected.deliveryNumber}
            defaultCurrency={selected.cod.currency}
            onSuccess={async () => {
              setFeedback({
                message: 'Courier claim opened.',
                tone: 'success',
              });
              await reload();
            }}
          />

          {transitioningClaim ? (
            <TransitionClaimDialog
              open={Boolean(transitioningClaim)}
              onOpenChange={(op) => {
                if (!op) setTransitioningClaim(null);
              }}
              deliveryId={selected.id}
              claim={transitioningClaim}
              onSuccess={async () => {
                setFeedback({
                  message: 'Courier claim updated.',
                  tone: 'success',
                });
                setTransitioningClaim(null);
                await reload();
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
