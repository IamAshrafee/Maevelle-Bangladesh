'use client';

import Link from 'next/link';
import {
  AlertCircle,
  Building2,
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import type { PurchaseDto, SupplierDto, WarehouseLocationDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSupplyDate } from '@/lib/supply/api';
import { purchaseWorkflowStatus } from '@/lib/supply/status';

export interface PurchaseDetailOverviewTabProps {
  readonly purchase: PurchaseDto;
  readonly suppliers: readonly SupplierDto[];
  readonly locations: readonly WarehouseLocationDto[];
}

export function PurchaseDetailOverviewTab({
  purchase,
  suppliers,
  locations,
}: PurchaseDetailOverviewTabProps) {
  const supplier = suppliers.find((s) => s.id === purchase.supplierId);
  const location = locations.find((loc) => loc.id === purchase.destinationLocationId);
  const workflowStatus = purchaseWorkflowStatus(purchase);

  return (
    <div className="space-y-4">
      {/* Cancellation Notice Banner if Cancelled */}
      {purchase.status === 'CANCELLED' ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <AlertCircle className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">Purchase Order Cancelled</p>
            <p className="text-muted-foreground">
              This purchase order was marked as cancelled. Quantities cannot be allocated to new shipments.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Supplier Profile Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-primary" />
                <span>Supplier Profile</span>
              </CardTitle>
              <Link
                href={`/suppliers/${purchase.supplierId}`}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <span>View profile</span>
                <ExternalLink className="size-3" />
              </Link>
            </div>
            <CardDescription>Commercial agreement partner for this purchase.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-semibold text-foreground">{purchase.supplierName}</p>
              {supplier ? (
                <p className="font-mono text-xs text-muted-foreground">{supplier.code}</p>
              ) : null}
            </div>

            <div className="grid gap-2 text-xs text-muted-foreground">
              {supplier?.contactName ? (
                <div className="flex items-center gap-2">
                  <User className="size-3.5 text-foreground" />
                  <span>{supplier.contactName}</span>
                </div>
              ) : null}
              {supplier?.contactEmail ? (
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-foreground" />
                  <a href={`mailto:${supplier.contactEmail}`} className="hover:underline">
                    {supplier.contactEmail}
                  </a>
                </div>
              ) : null}
              {supplier?.contactPhone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-foreground" />
                  <a href={`tel:${supplier.contactPhone}`} className="hover:underline">
                    {supplier.contactPhone}
                  </a>
                </div>
              ) : null}
              {supplier?.websiteUrl ? (
                <div className="flex items-center gap-2">
                  <Globe className="size-3.5 text-foreground" />
                  <a
                    href={supplier.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline text-primary"
                  >
                    {supplier.websiteUrl}
                  </a>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {supplier?.leadTimeDays ? (
                <Badge variant="secondary" className="gap-1 text-[11px]">
                  <Clock className="size-3" />
                  {supplier.leadTimeDays}d lead time
                </Badge>
              ) : null}
              {supplier?.paymentTerms ? (
                <Badge variant="outline" className="text-[11px]">
                  Terms: {supplier.paymentTerms}
                </Badge>
              ) : null}
              <Badge variant="outline" className="text-[11px]">
                Currency: {purchase.currencyCode}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Logistics & Delivery Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4 text-primary" />
              <span>Logistics & Receiving</span>
            </CardTitle>
            <CardDescription>Intended destination warehouse and agreed dates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Destination Facility</p>
              <p className="font-semibold text-foreground">
                {purchase.destinationLocationName ?? location?.name ?? 'Not assigned (Select at shipment stage)'}
              </p>
              {location?.code ? (
                <p className="font-mono text-xs text-muted-foreground">{location.code}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="size-3" />
                  Order Date
                </p>
                <p className="mt-0.5 font-medium">{formatSupplyDate(purchase.orderDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  Expected Delivery
                </p>
                <p className="mt-0.5 font-medium">
                  {purchase.expectedDate ? formatSupplyDate(purchase.expectedDate) : 'Not scheduled'}
                </p>
              </div>
            </div>

            {purchase.supplierReference ? (
              <div className="rounded-lg border bg-muted/30 p-2.5">
                <p className="text-xs text-muted-foreground">Supplier Reference / Quote #</p>
                <p className="font-mono font-medium text-xs text-foreground mt-0.5">
                  {purchase.supplierReference}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Timeline & Notes Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Internal Notes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-primary" />
              <span>Internal Notes & Remarks</span>
            </CardTitle>
            <CardDescription>Operational annotations recorded by supply team.</CardDescription>
          </CardHeader>
          <CardContent>
            {purchase.notes ? (
              <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                {purchase.notes}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No internal notes recorded for this purchase order.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Audit & System State */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-primary" />
              <span>Audit & Provenance</span>
            </CardTitle>
            <CardDescription>System records and immutable version tracking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">System Identifier</span>
              <span className="font-mono text-muted-foreground">{purchase.id}</span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Created Timestamp</span>
              <span>{formatSupplyDate(purchase.createdAt)}</span>
            </div>
            {purchase.placedAt ? (
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-muted-foreground">Placed Timestamp</span>
                <span>{formatSupplyDate(purchase.placedAt)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-muted-foreground">Document Version</span>
              <span className="font-mono font-medium">v{purchase.version}</span>
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-muted-foreground">Workflow Stage</span>
              <StatusBadge status={workflowStatus} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
