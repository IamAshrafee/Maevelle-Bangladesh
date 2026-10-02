'use client';

import Link from 'next/link';
import { ArrowLeft, Banknote, Calendar, Pencil, ShieldAlert } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { OperationalPageHeader } from '@/components/operational-worklist';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { formatAssetDate, humanizeAssetCode } from '@/lib/assets/format';
import { AssetConditionBadge, AssetStatusBadge } from '../asset-status-badge';
import { isTerminalAsset } from '../types';

interface AssetDetailHeaderProps {
  asset: AssetDetailDto;
  canManage: boolean;
  canLifecycle: boolean;
  onEdit: () => void;
  onSell: () => void;
  onDispose: () => void;
}

export function AssetDetailHeader({
  asset,
  canManage,
  canLifecycle,
  onEdit,
  onSell,
  onDispose,
}: AssetDetailHeaderProps) {
  const terminal = isTerminalAsset(asset.status);

  return (
    <div className="grid gap-3">
      <Breadcrumb
        items={[
          { label: 'Operations', href: '/' },
          { label: 'Assets', href: '/assets' },
          { label: `${asset.assetCode} · ${asset.name}` },
        ]}
      />

      <OperationalPageHeader
        eyebrow={asset.assetCode}
        title={asset.name}
        description={`${asset.categoryName ?? 'Uncategorized'} · ${humanizeAssetCode(asset.acquisitionSource)} acquisition`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/assets" />}>
              <ArrowLeft className="size-4" />
              <span>All Assets</span>
            </Button>

            {canManage && !terminal ? (
              <Button variant="outline" onClick={onEdit}>
                <Pencil className="size-4" />
                <span>Edit</span>
              </Button>
            ) : null}

            {canLifecycle && !terminal ? (
              <>
                <Button
                  variant="outline"
                  onClick={onSell}
                  className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
                >
                  <Banknote className="size-4" />
                  <span>Sell Asset</span>
                </Button>
                <Button variant="destructive" onClick={onDispose}>
                  <ShieldAlert className="size-4" />
                  <span>Dispose</span>
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      {/* Status Badges & Quick Metadata Bar */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <AssetStatusBadge status={asset.status} />
        <AssetConditionBadge condition={asset.condition} />

        {asset.warrantyExpiresOn ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground">
            <Calendar className="size-3 text-muted-foreground" />
            <span>Warranty until {formatAssetDate(asset.warrantyExpiresOn)}</span>
          </span>
        ) : null}

        {terminal ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Permanent Historical Archive
          </span>
        ) : null}
      </div>
    </div>
  );
}
