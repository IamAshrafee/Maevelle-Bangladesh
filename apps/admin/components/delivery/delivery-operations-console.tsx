'use client';

import {
  AlertCircle,
  Archive,
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  HelpCircle,
  Loader2,
  Package,
  PackageCheck,
  PackageOpen,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Store,
  Truck,
  User,
  Warehouse,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';

import { CustomerDeliveryRiskCard } from '@/components/delivery/customer-delivery-risk-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';
import { fetchApiData } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { CustomerDeliveryHistoryDto } from '@maevelle/contracts';

/* -------------------------------------------------------------------------- */
/* Interfaces                                                                 */
/* -------------------------------------------------------------------------- */

interface DeliverySummaryItem {
  id: string;
  deliveryNumber: string;
  orderNumber: string;
  operationalStatus: string;
  providerCode: string;
  bookingStatus?: string;
  hasOpenException?: boolean;
}

interface FulfillmentSummaryItem {
  id: string;
  fulfillmentNumber: string;
  orderNumber: string;
  status: string;
  deliveryId?: string | null;
}

interface ReturnSummaryItem {
  id: string;
  return_number: string;
  case_type: 'CUSTOMER_RETURN' | 'RTO';
  case_status: string;
  authorization_status: string;
  transport_status: string;
  receipt_status: string;
  inspection_status: string;
}

interface PathaoStatusSummary {
  accounts: readonly { accountId: string; status: string; environment: string }[];
  stores: readonly unknown[];
}

export function DeliveryOperationsConsole() {
  const [deliveries, setDeliveries] = useState<readonly DeliverySummaryItem[]>([]);
  const [fulfillments, setFulfillments] = useState<readonly FulfillmentSummaryItem[]>([]);
  const [returns, setReturns] = useState<readonly ReturnSummaryItem[]>([]);
  const [pathaoData, setPathaoData] = useState<PathaoStatusSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Customer Risk Lookup tool
  const [customerSearch, setCustomerSearch] = useState('');
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [customerRiskData, setCustomerRiskData] = useState<CustomerDeliveryHistoryDto | null>(null);
  const [customerMeta, setCustomerMeta] = useState<{
    customerName?: string | undefined;
    phone?: string | undefined;
  }>({});
  const [riskError, setRiskError] = useState('');

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [delRes, fulRes, retRes, pthRes] = await Promise.all([
        fetchApiData<{ items?: readonly DeliverySummaryItem[] } | readonly DeliverySummaryItem[]>(
          '/admin/deliveries?pageSize=100',
        ).catch(() => []),
        fetchApiData<{ items?: readonly FulfillmentSummaryItem[] } | readonly FulfillmentSummaryItem[]>(
          '/admin/fulfillments?pageSize=100',
        ).catch(() => []),
        fetchApiData<{ items?: readonly ReturnSummaryItem[] }>('/admin/returns?pageSize=100').catch(
          () => ({ items: [] }),
        ),
        fetchApiData<PathaoStatusSummary>('/admin/integrations/pathao').catch(() => null),
      ]);

      const delList = Array.isArray(delRes)
        ? delRes
        : (delRes as { items?: readonly DeliverySummaryItem[] })?.items ?? [];
      const fulList = Array.isArray(fulRes)
        ? fulRes
        : (fulRes as { items?: readonly FulfillmentSummaryItem[] })?.items ?? [];
      const retList = retRes?.items ?? [];

      setDeliveries(delList);
      setFulfillments(fulList);
      setReturns(retList);
      setPathaoData(pthRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load delivery operations overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  // Operational Queues
  const fulfillmentsReadyForBooking = fulfillments.filter(
    (f) => f.status === 'READY_FOR_DISPATCH' || f.status === 'PACKED',
  );
  const deliveriesInTransit = deliveries.filter(
    (d) => d.operationalStatus === 'IN_TRANSIT' || d.operationalStatus === 'OUT_FOR_DELIVERY',
  );
  const deliveryFailures = deliveries.filter(
    (d) => d.operationalStatus === 'FAILED' || d.operationalStatus === 'CANCELLED',
  );
  const unknownOutcomeDeliveries = deliveries.filter(
    (d) => d.bookingStatus === 'UNKNOWN_OUTCOME' || d.operationalStatus === 'UNKNOWN_OUTCOME',
  );
  const customerReturnsPendingAuth = returns.filter(
    (r) => r.case_type === 'CUSTOMER_RETURN' && r.authorization_status === 'PENDING',
  );
  const rtoReturning = returns.filter(
    (r) =>
      r.case_type === 'RTO' &&
      (r.transport_status === 'IN_TRANSIT' || r.transport_status === 'EXPECTED'),
  );
  const rtoArrivedAwaitingReceipt = returns.filter(
    (r) =>
      (r.case_type === 'RTO' && r.receipt_status === 'NOT_RECEIVED') ||
      r.receipt_status === 'PARTIALLY_RECEIVED',
  );
  const returnsAwaitingInspection = returns.filter(
    (r) =>
      r.receipt_status !== 'NOT_RECEIVED' &&
      r.inspection_status !== 'COMPLETED' &&
      r.case_status === 'OPEN',
  );

  // Quick Buyer Reliability Lookup
  const handleSearchCustomerRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerSearch.trim()) return;

    setSearchingCustomer(true);
    setRiskError('');
    setCustomerRiskData(null);

    try {
      // Find customer by search query (phone or name)
      const res = await fetchApiData<{
        items: readonly { id: string; displayName?: string; phone?: string }[];
      }>(`/admin/customers?search=${encodeURIComponent(customerSearch.trim())}&pageSize=5`);

      const match = res?.items?.[0];
      if (!match) {
        setRiskError(`No customer found matching "${customerSearch}".`);
        return;
      }

      // Fetch delivery history & risk
      const riskRes = await fetchApiData<CustomerDeliveryHistoryDto>(
        `/admin/customers/${match.id}/delivery-history`,
      );

      setCustomerRiskData(riskRes);
      setCustomerMeta({
        customerName: match.displayName || match.phone || 'Customer',
        phone: match.phone,
      });
    } catch (err) {
      setRiskError(err instanceof Error ? err.message : 'Failed to look up customer delivery risk');
    } finally {
      setSearchingCustomer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Delivery Operations
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              COMMAND CENTER
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time fulfillment, dispatch, in-transit parcels, failed deliveries, RTO queues, and
            warehouse return receiving.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadOperations()}
            disabled={loading}
            className="h-9"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh Overview
          </Button>

          <Link
            href="/fulfillments"
            className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'h-9')}
          >
            <PackageCheck className="h-4 w-4 mr-1.5" />
            Go to Fulfillments
          </Link>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI Overview */}
      <Stats>
        <StatsCard>
          <StatsTitle>Ready for Dispatch</StatsTitle>
          <StatsValue>{fulfillmentsReadyForBooking.length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Parcels in Transit</StatsTitle>
          <StatsValue>{deliveriesInTransit.length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Delivery Failures</StatsTitle>
          <StatsValue className={deliveryFailures.length > 0 ? 'text-destructive' : ''}>
            {deliveryFailures.length}
          </StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>RTO Returning</StatsTitle>
          <StatsValue>{rtoReturning.length}</StatsValue>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Stock Awaiting Inspection</StatsTitle>
          <StatsValue className={returnsAwaitingInspection.length > 0 ? 'text-amber-600' : ''}>
            {returnsAwaitingInspection.length}
          </StatsValue>
        </StatsCard>
      </Stats>

      {/* ------------------------------------------------------------------ */}
      {/* OPERATIONAL QUEUES ("What needs my attention right now?")           */}
      {/* ------------------------------------------------------------------ */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Operational Attention Queues
          </h2>
          <p className="text-xs text-muted-foreground">
            Direct action items requiring merchant intervention across the delivery lifecycle.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Queue 1: Unknown Outcome Courier Bookings */}
          <Card
            className={`border transition-all ${
              unknownOutcomeDeliveries.length > 0
                ? 'border-amber-500/50 bg-amber-500/5 dark:bg-amber-950/20'
                : 'border-border'
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  Unknown Courier Bookings
                </CardTitle>
                <Badge
                  variant={unknownOutcomeDeliveries.length > 0 ? 'default' : 'secondary'}
                  className={
                    unknownOutcomeDeliveries.length > 0
                      ? 'bg-amber-600 text-white text-xs'
                      : 'text-xs'
                  }
                >
                  {unknownOutcomeDeliveries.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Carrier booking timed out; verify outcome with provider dashboard before retry.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/deliveries"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Reconcile Bookings
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Queue 2: Delivery Failures & Exceptions */}
          <Card
            className={`border transition-all ${
              deliveryFailures.length > 0
                ? 'border-red-500/50 bg-red-500/5 dark:bg-red-950/20'
                : 'border-border'
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  Delivery Failures
                </CardTitle>
                <Badge
                  variant={deliveryFailures.length > 0 ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {deliveryFailures.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Parcels where customer was unreachable, rejected parcel, or carrier failed delivery.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/deliveries"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Review Failed Shipments
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Queue 3: RTO Awaiting Physical Receipt */}
          <Card
            className={`border transition-all ${
              rtoArrivedAwaitingReceipt.length > 0
                ? 'border-blue-500/50 bg-blue-500/5 dark:bg-blue-950/20'
                : 'border-border'
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-blue-600" />
                  RTO Awaiting Receipt
                </CardTitle>
                <Badge
                  variant={rtoArrivedAwaitingReceipt.length > 0 ? 'default' : 'secondary'}
                  className={
                    rtoArrivedAwaitingReceipt.length > 0
                      ? 'bg-blue-600 text-white text-xs'
                      : 'text-xs'
                  }
                >
                  {rtoArrivedAwaitingReceipt.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Parcels returned by courier to warehouse facility awaiting physical unboxing.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/returns?tab=rto"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Post Warehouse Receipt
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Queue 4: Returns Stock Awaiting Condition Inspection */}
          <Card
            className={`border transition-all ${
              returnsAwaitingInspection.length > 0
                ? 'border-purple-500/50 bg-purple-500/5 dark:bg-purple-950/20'
                : 'border-border'
            }`}
          >
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Archive className="h-4 w-4 text-purple-600" />
                  Inspection &amp; Disposition
                </CardTitle>
                <Badge
                  variant={returnsAwaitingInspection.length > 0 ? 'default' : 'secondary'}
                  className={
                    returnsAwaitingInspection.length > 0
                      ? 'bg-purple-600 text-white text-xs'
                      : 'text-xs'
                  }
                >
                  {returnsAwaitingInspection.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Physically received items in quarantine hold awaiting sellable restock or damage
                disposition.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/returns"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Inspect Stock
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Queue 5: Customer Returns Awaiting Authorization */}
          <Card className="border">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <RotateCcw className="h-4 w-4 text-primary" />
                  Returns Awaiting Approval
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {customerReturnsPendingAuth.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                New buyer return requests submitted that require commercial review and
                authorization.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/returns?tab=customer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Authorize Requests
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>

          {/* Queue 6: Fulfillments Ready for Courier Booking */}
          <Card className="border">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-emerald-600" />
                  Ready for Courier Booking
                </CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {fulfillmentsReadyForBooking.length}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Orders picked and packed in warehouse ready to be assigned to Pathao or manual
                courier.
              </CardDescription>
            </CardHeader>
            <CardFooter className="p-4 pt-2">
              <Link
                href="/fulfillments"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'w-full text-xs h-8')}
              >
                Book Couriers
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2-COLUMN LOWER SECTION: BUYER COD RELIABILITY LOOKUP & CARRIER HEALTH*/}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Buyer Delivery Risk Intelligence Tool (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Buyer Delivery Reliability &amp; COD Risk Intelligence
              </CardTitle>
              <CardDescription className="text-xs">
                Check historical delivery completion and RTO rates across past orders before paying
                carrier booking fees or dispatching high-value COD parcels.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4 space-y-4">
              <form onSubmit={handleSearchCustomerRisk} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Enter customer phone (e.g. 017...) or name"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-8 h-9 text-xs"
                  />
                </div>
                <Button type="submit" size="sm" disabled={searchingCustomer} className="h-9">
                  {searchingCustomer ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Check Reliability'
                  )}
                </Button>
              </form>

              {riskError && (
                <Alert variant="destructive" className="py-2 text-xs">
                  <AlertCircle className="h-3.5 w-3.5" />
                  <AlertDescription>{riskError}</AlertDescription>
                </Alert>
              )}

              {customerRiskData && (
                <div className="pt-2">
                  <CustomerDeliveryRiskCard
                    history={customerRiskData}
                    customerName={customerMeta.customerName}
                    phone={customerMeta.phone}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Courier Integration Health & Setup (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  Courier Integration Health
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Carrier API gateway &amp; store status
                </CardDescription>
              </div>

              <Link
                href="/delivery/couriers"
                className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 text-xs text-primary')}
              >
                Manage
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Link>
            </CardHeader>

            <CardContent className="p-4 space-y-3 text-xs">
              {/* Pathao Status */}
              <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Pathao Courier</span>
                    {pathaoData?.accounts?.[0] ? (
                      <Badge
                        variant="outline"
                        className={
                          pathaoData.accounts[0].status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]'
                            : 'text-[10px]'
                        }
                      >
                        {pathaoData.accounts[0].status}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-amber-700">
                        Not Configured
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {pathaoData?.stores?.length ?? 0} pickup stores mapped
                  </p>
                </div>

                <Link
                  href="/delivery/couriers"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-7 text-xs')}
                >
                  Settings
                </Link>
              </div>

              {/* Steadfast Status */}
              <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Steadfast Courier</span>
                    <Badge variant="outline" className="text-[10px]">
                      Supported
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Native nationwide courier support
                  </p>
                </div>

                <Link
                  href="/delivery/couriers"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-7 text-xs')}
                >
                  Configure
                </Link>
              </div>

              {/* In-House Driver Fleet */}
              <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">In-House Fleet</span>
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 text-[10px]"
                    >
                      Active
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Self-delivered &amp; retail pickup points
                  </p>
                </div>

                <Link
                  href="/deliveries"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-7 text-xs')}
                >
                  Deliveries
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
