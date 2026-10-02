'use client';

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  FileText,
  MapPin,
  RefreshCw,
  UserRound,
  Wrench,
  Ban,
  ShieldCheck,
} from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { humanizeAssetCode } from '@/lib/assets/format';
import { isTerminalAsset, type AssetDialogKind, type AssetLifecyclePreset } from '../types';

interface AssetOverviewTabProps {
  asset: AssetDetailDto;
  canManage: boolean;
  canLifecycle: boolean;
  onOpenDialog: (kind: AssetDialogKind, preset?: AssetLifecyclePreset) => void;
}

export function AssetOverviewTab({
  asset,
  canManage,
  canLifecycle,
  onOpenDialog,
}: AssetOverviewTabProps) {
  const terminal = isTerminalAsset(asset.status);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Left Column (2 Cols): Identity and Physical Custody */}
      <div className="grid gap-5 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Identity & Specifications</CardTitle>
            <CardDescription>
              Physical identifiers, model specifications, and current operating condition.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <DetailItem
              label="Asset Code"
              value={<span className="font-mono font-bold text-foreground">{asset.assetCode}</span>}
            />
            <DetailItem label="Category" value={asset.categoryName ?? 'Uncategorized'} />
            <DetailItem
              label="Brand / Manufacturer"
              value={
                asset.brand ?? <span className="text-muted-foreground italic">Not specified</span>
              }
            />
            <DetailItem
              label="Model"
              value={
                asset.model ?? <span className="text-muted-foreground italic">Not specified</span>
              }
            />
            <DetailItem
              label="Serial Number"
              value={
                asset.serialNumber ? (
                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {asset.serialNumber}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">No serial recorded</span>
                )
              }
            />
            <DetailItem label="Condition" value={humanizeAssetCode(asset.condition)} />
            <div className="sm:col-span-2">
              <DetailItem
                label="Description"
                value={
                  asset.description || (
                    <span className="text-muted-foreground italic">No description provided</span>
                  )
                }
              />
            </div>
            <div className="sm:col-span-2">
              <DetailItem
                label="Internal Notes"
                value={
                  asset.notes || (
                    <span className="text-muted-foreground italic">No internal notes</span>
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Location & Custody Card */}
        <Card>
          <CardHeader>
            <CardTitle>Physical Location & Custody</CardTitle>
            <CardDescription>
              Current possession, business facility, and desk placement.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
              <MapPin className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Location
                </span>
                <p className="font-semibold text-foreground text-sm mt-0.5">
                  {asset.locationName ?? asset.customLocation ?? 'Unlocated'}
                </p>
                {asset.locationName && asset.customLocation ? (
                  <p className="text-xs text-muted-foreground mt-0.5">{asset.customLocation}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
              <UserRound className="size-5 text-primary shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Custodian
                </span>
                <p className="font-semibold text-foreground text-sm mt-0.5">
                  {asset.custodianName ?? 'Unassigned (General custody)'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {asset.custodianName ? 'Day-to-day responsible member' : 'Company possession'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: State-Aware Operations Card */}
      <div className="grid gap-5 content-start">
        <Card className="border-primary/20 shadow-xs">
          <CardHeader>
            <CardTitle>Operate Asset</CardTitle>
            <CardDescription>
              {terminal
                ? 'Historical record. Active lifecycle operations are concluded.'
                : 'Execute audited operational commands and state transitions.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="grid gap-3">
            {/* Contextual Action Banners based on Status */}
            {asset.status === 'UNDER_REPAIR' && canLifecycle ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                  <Wrench className="size-4 shrink-0" />
                  <span>Currently Under Repair</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This equipment is currently undergoing maintenance. Once repairs are verified,
                  complete the repair to return it to active service.
                </p>
                <Button
                  className="w-full justify-center bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() =>
                    onOpenDialog('lifecycle', {
                      targetStatus: 'ACTIVE',
                      suggestedCondition: 'GOOD',
                      title: 'Complete Repair & Restore to Service',
                      description:
                        'Restore this asset to active duty after maintenance. Select resulting condition and enter completion remarks.',
                      defaultReason: 'Repair completed and verified operational.',
                    })
                  }
                >
                  <CheckCircle2 className="size-4 mr-1.5" />
                  Complete Repair
                </Button>
              </div>
            ) : null}

            {asset.status === 'DAMAGED' && canLifecycle ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Marked as Damaged</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  This item is broken or unusable. Send it for maintenance or proceed with physical
                  disposal.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      onOpenDialog('lifecycle', {
                        targetStatus: 'UNDER_REPAIR',
                        suggestedCondition: 'NEEDS_REPAIR',
                        title: 'Send Asset to Repair',
                        description: 'Transition this damaged equipment to repair status.',
                        defaultReason: 'Sent to technical service for diagnostics and repair.',
                      })
                    }
                  >
                    <Wrench className="size-3.5 mr-1" />
                    Send to Repair
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => onOpenDialog('dispose')}>
                    <Ban className="size-3.5 mr-1" />
                    Dispose
                  </Button>
                </div>
              </div>
            ) : null}

            {asset.status === 'LOST' && canLifecycle ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>Asset is Flagged as Lost</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  If this equipment is located, execute a recovery command to restore it to service.
                </p>
                <Button
                  className="w-full justify-center"
                  onClick={() =>
                    onOpenDialog('lifecycle', {
                      targetStatus: 'ACTIVE',
                      suggestedCondition: 'GOOD',
                      title: 'Recover Lost Asset',
                      description: 'Restore this recovered equipment to active service inventory.',
                      defaultReason: 'Asset located and returned to active custody.',
                    })
                  }
                >
                  <ShieldCheck className="size-4 mr-1.5" />
                  Mark Recovered
                </Button>
              </div>
            ) : null}

            {asset.status === 'IN_STORAGE' && canLifecycle ? (
              <div className="rounded-xl border border-muted bg-muted/40 p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  This asset is stored in reserve. Ready to deploy to active operations when needed.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center"
                  onClick={() =>
                    onOpenDialog('lifecycle', {
                      targetStatus: 'ACTIVE',
                      suggestedCondition: asset.condition,
                      title: 'Deploy to Active Service',
                      description: 'Transition asset from storage into active operational service.',
                      defaultReason: 'Deployed to active business operations.',
                    })
                  }
                >
                  <CheckCircle2 className="size-3.5 mr-1.5 text-emerald-600" />
                  Deploy to Active Service
                </Button>
              </div>
            ) : null}

            {/* Standard Operational Actions */}
            {canManage && !terminal ? (
              <>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => onOpenDialog('assign')}
                >
                  <UserRound className="size-4 mr-2 text-primary" />
                  Change Custodian
                </Button>

                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => onOpenDialog('move')}
                >
                  <MapPin className="size-4 mr-2 text-primary" />
                  Move Location
                </Button>

                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => onOpenDialog('maintenance')}
                >
                  <Wrench className="size-4 mr-2 text-primary" />
                  Record Maintenance / Service
                </Button>

                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => onOpenDialog('attach')}
                >
                  <FileText className="size-4 mr-2 text-primary" />
                  Attach Document / Photo
                </Button>
              </>
            ) : null}

            {/* Lifecycle Quick Commands */}
            {canLifecycle && !terminal ? (
              <>
                <div className="pt-2 border-t">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
                    Lifecycle State
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {asset.status !== 'IN_STORAGE' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs justify-start h-8"
                        onClick={() =>
                          onOpenDialog('lifecycle', {
                            targetStatus: 'IN_STORAGE',
                            suggestedCondition: asset.condition,
                            title: 'Move to Storage',
                            description: 'Place this asset into storage reserve.',
                            defaultReason: 'Moved to storage reserve.',
                          })
                        }
                      >
                        <Archive className="size-3.5 mr-1.5 text-muted-foreground" />
                        Put in Storage
                      </Button>
                    ) : null}

                    {asset.status !== 'UNDER_REPAIR' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs justify-start h-8 text-amber-700 dark:text-amber-400"
                        onClick={() =>
                          onOpenDialog('lifecycle', {
                            targetStatus: 'UNDER_REPAIR',
                            suggestedCondition: 'NEEDS_REPAIR',
                            title: 'Send to Repair',
                            description: 'Flag asset as actively undergoing repair.',
                            defaultReason: 'Sent for maintenance and repair.',
                          })
                        }
                      >
                        <Wrench className="size-3.5 mr-1.5" />
                        Send to Repair
                      </Button>
                    ) : null}

                    {asset.status !== 'LOST' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs justify-start h-8 text-destructive"
                        onClick={() =>
                          onOpenDialog('lifecycle', {
                            targetStatus: 'LOST',
                            suggestedCondition: asset.condition,
                            title: 'Mark Asset as Lost',
                            description: 'Flag asset as lost or missing.',
                            defaultReason: 'Missing during inventory audit.',
                          })
                        }
                      >
                        <AlertTriangle className="size-3.5 mr-1.5" />
                        Mark Lost
                      </Button>
                    ) : null}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs justify-start h-8"
                      onClick={() => onOpenDialog('lifecycle')}
                    >
                      <RefreshCw className="size-3.5 mr-1.5 text-muted-foreground" />
                      Other Status…
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            {terminal ? (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                This Asset has reached its terminal lifecycle state. Operational changes,
                assignments, and maintenance are disabled while preserving historical and financial
                proof.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
