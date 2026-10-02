'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AssetDetailDto, AssetOptionsDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalFeedback } from '@/components/operational-worklist';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchApiData } from '@/lib/api';
import { AssetDetailHeader } from './detail/asset-detail-header';
import { AssetOverviewTab } from './detail/asset-overview-tab';
import { AssetFinancialTab } from './detail/asset-financial-tab';
import { AssetMaintenanceTab } from './detail/asset-maintenance-tab';
import { AssetFilesTab } from './detail/asset-files-tab';
import { AssetActivityTab } from './detail/asset-activity-tab';
import { AssetEditDialog } from './detail/dialogs/asset-edit-dialog';
import { AssetAssignDialog } from './detail/dialogs/asset-assign-dialog';
import { AssetMoveDialog } from './detail/dialogs/asset-move-dialog';
import { AssetLifecycleDialog } from './detail/dialogs/asset-lifecycle-dialog';
import { AssetMaintenanceDialog } from './detail/dialogs/asset-maintenance-dialog';
import { AssetSaleDialog } from './detail/dialogs/asset-sale-dialog';
import { AssetDisposalDialog } from './detail/dialogs/asset-disposal-dialog';
import { AssetAttachMediaDialog } from './detail/dialogs/asset-attach-media-dialog';
import { AssetVoidMaintenanceDialog } from './detail/dialogs/asset-void-maintenance-dialog';
import { AssetDetachMediaDialog } from './detail/dialogs/asset-detach-media-dialog';
import type { AssetDialogKind, AssetLifecyclePreset } from './types';

export function AssetDetail({ assetId }: { readonly assetId: string }) {
  const searchParams = useSearchParams();
  const canView = useAdminCapability('assets.view');
  const canManage = useAdminCapability('assets.manage');
  const canLifecycle = useAdminCapability('assets.lifecycle.manage');

  const [asset, setAsset] = useState<AssetDetailDto>();
  const [options, setOptions] = useState<AssetOptionsDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  // Active tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Dialog management
  const [activeDialog, setActiveDialog] = useState<AssetDialogKind>();
  const [lifecyclePreset, setLifecyclePreset] = useState<AssetLifecyclePreset>();
  const [voidMaintenanceId, setVoidMaintenanceId] = useState<string | null>(null);
  const [detachMediaInfo, setDetachMediaInfo] = useState<{ id: string; filename: string } | null>(
    null,
  );

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError('');
    try {
      const [detail, nextOptions] = await Promise.all([
        fetchApiData<AssetDetailDto>(`/admin/assets/${assetId}`),
        fetchApiData<AssetOptionsDto>('/admin/assets/options'),
      ]);
      setAsset(detail);
      setOptions(nextOptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Asset could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [assetId, canView]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle URL deep-linking for actions and tabs
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (
      requestedTab &&
      ['overview', 'financial', 'maintenance', 'files', 'activity'].includes(requestedTab)
    ) {
      setActiveTab(requestedTab);
    }

    const requestedAction = searchParams.get('action');
    if (requestedAction) {
      if (requestedAction === 'edit' && canManage) setActiveDialog('edit');
      else if (requestedAction === 'assign' && canManage) setActiveDialog('assign');
      else if (requestedAction === 'move' && canManage) setActiveDialog('move');
      else if (requestedAction === 'maintenance' && canManage) setActiveDialog('maintenance');
      else if (requestedAction === 'attach' && canManage) setActiveDialog('attach');
      else if (requestedAction === 'sale' && canLifecycle) setActiveDialog('sale');
      else if (requestedAction === 'dispose' && canLifecycle) setActiveDialog('dispose');
      else if (requestedAction === 'complete-repair' && canLifecycle) {
        setLifecyclePreset({
          targetStatus: 'ACTIVE',
          suggestedCondition: 'GOOD',
          title: 'Complete Repair & Restore to Service',
          description: 'Restore this asset to active duty after maintenance.',
          defaultReason: 'Repair completed and verified operational.',
        });
        setActiveDialog('lifecycle');
      }
    }
  }, [searchParams, canManage, canLifecycle]);

  if (!canView) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          You do not have permission to view asset details. Please contact your organization
          administrator.
        </OperationalFeedback>
        <Button nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft className="size-4 mr-1.5" />
          Back to Dashboard
        </Button>
      </main>
    );
  }

  if (loading && !asset) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </main>
    );
  }

  if (!asset) {
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">{error || 'Asset was not found.'}</OperationalFeedback>
        <Button nativeButton={false} render={<Link href="/assets" />}>
          <ArrowLeft className="size-4 mr-1.5" />
          Back to Assets
        </Button>
      </main>
    );
  }

  function handleOpenDialog(kind: AssetDialogKind, preset?: AssetLifecyclePreset) {
    setLifecyclePreset(preset);
    setActiveDialog(kind);
  }

  return (
    <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* Header and top-level action controls */}
      <AssetDetailHeader
        asset={asset}
        canManage={canManage}
        canLifecycle={canLifecycle}
        onEdit={() => handleOpenDialog('edit')}
        onSell={() => handleOpenDialog('sale')}
        onDispose={() => handleOpenDialog('dispose')}
      />

      {feedback ? <OperationalFeedback>{feedback}</OperationalFeedback> : null}
      {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}

      {/* Tabs navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financial">Acquisition & Finance</TabsTrigger>
          <TabsTrigger value="maintenance">
            <span>Maintenance</span>
            {asset.maintenance.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                {asset.maintenance.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="files">
            <span>Files & Photos</span>
            {asset.media.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                {asset.media.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="activity">
            <span>Timeline</span>
            {asset.history.length > 0 ? (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-mono">
                {asset.history.length}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <AssetOverviewTab
            asset={asset}
            canManage={canManage}
            canLifecycle={canLifecycle}
            onOpenDialog={handleOpenDialog}
          />
        </TabsContent>

        <TabsContent value="financial">
          <AssetFinancialTab asset={asset} />
        </TabsContent>

        <TabsContent value="maintenance">
          <AssetMaintenanceTab
            asset={asset}
            canManage={canManage}
            onRecordMaintenance={() => handleOpenDialog('maintenance')}
            onVoidMaintenance={(id) => setVoidMaintenanceId(id)}
          />
        </TabsContent>

        <TabsContent value="files">
          <AssetFilesTab
            asset={asset}
            canManage={canManage}
            onAttachFile={() => handleOpenDialog('attach')}
            onDetachFile={(id, filename) => setDetachMediaInfo({ id, filename })}
          />
        </TabsContent>

        <TabsContent value="activity">
          <AssetActivityTab asset={asset} />
        </TabsContent>
      </Tabs>

      {/* Operational Command Dialogs */}
      {asset ? (
        <>
          <AssetEditDialog
            open={activeDialog === 'edit'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            options={options}
            onSuccess={() => {
              setFeedback('Asset details updated successfully.');
              void loadData();
            }}
          />

          <AssetAssignDialog
            open={activeDialog === 'assign'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            options={options}
            onSuccess={() => {
              setFeedback('Custodian assignment updated.');
              void loadData();
            }}
          />

          <AssetMoveDialog
            open={activeDialog === 'move'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            options={options}
            onSuccess={() => {
              setFeedback('Asset location updated.');
              void loadData();
            }}
          />

          <AssetLifecycleDialog
            open={activeDialog === 'lifecycle'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            preset={lifecyclePreset}
            onSuccess={() => {
              setFeedback('Lifecycle status updated.');
              void loadData();
            }}
          />

          <AssetMaintenanceDialog
            open={activeDialog === 'maintenance'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            options={options}
            onSuccess={() => {
              setFeedback('Maintenance entry saved successfully.');
              void loadData();
            }}
          />

          <AssetSaleDialog
            open={activeDialog === 'sale'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            options={options}
            onSuccess={() => {
              setFeedback('Asset sold and proceeds deposited into the receiving Account.');
              void loadData();
            }}
          />

          <AssetDisposalDialog
            open={activeDialog === 'dispose'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            onSuccess={() => {
              setFeedback('Asset has been permanently retired and disposed.');
              void loadData();
            }}
          />

          <AssetAttachMediaDialog
            open={activeDialog === 'attach'}
            onOpenChange={(open) => !open && setActiveDialog(undefined)}
            asset={asset}
            onSuccess={() => {
              setFeedback('Private media file attached to asset.');
              void loadData();
            }}
          />

          <AssetVoidMaintenanceDialog
            open={Boolean(voidMaintenanceId)}
            onOpenChange={(open) => !open && setVoidMaintenanceId(null)}
            assetId={asset.id}
            maintenanceId={voidMaintenanceId}
            onSuccess={() => {
              setFeedback('Maintenance entry voided.');
              void loadData();
            }}
          />

          <AssetDetachMediaDialog
            open={Boolean(detachMediaInfo)}
            onOpenChange={(open) => !open && setDetachMediaInfo(null)}
            assetId={asset.id}
            linkId={detachMediaInfo?.id ?? null}
            filename={detachMediaInfo?.filename ?? null}
            onSuccess={() => {
              setFeedback('Media detached from asset.');
              void loadData();
            }}
          />
        </>
      ) : null}
    </main>
  );
}
