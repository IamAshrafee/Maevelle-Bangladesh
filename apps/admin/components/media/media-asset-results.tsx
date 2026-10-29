'use client';

import Image from 'next/image';
import { FileIcon, FileImage } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, LoadingState } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/status-badge';
import { getAdminMediaUrl } from '@/lib/media/api';

import { formatFileSize } from './media-file-size';
import type { MediaAsset } from './media-workspace-types';

interface MediaAssetResultsProps {
  readonly assets: readonly MediaAsset[];
  readonly loading: boolean;
  readonly viewMode: 'grid' | 'list';
  readonly selectedAssetId: string;
  readonly selectedForBulk: ReadonlySet<string>;
  readonly onInspect: (assetId: string) => void;
  readonly onToggleBulk: (assetId: string) => void;
}

function AssetPreview({
  asset,
  rendition,
}: {
  asset: MediaAsset;
  rendition: 'card' | 'thumbnail';
}) {
  if (asset.assetType === 'IMAGE' && asset.status === 'READY') {
    return (
      <Image
        src={getAdminMediaUrl(asset.id, { rendition })}
        alt={asset.altText || ''}
        fill
        unoptimized
        loading="lazy"
        className="object-cover motion-safe:transition-transform motion-safe:duration-150 motion-safe:group-hover:scale-[1.03]"
        sizes={
          rendition === 'card' ? '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw' : '40px'
        }
      />
    );
  }
  return asset.assetType === 'DOCUMENT' ? (
    <div className="flex flex-col items-center justify-center gap-1 text-primary">
      <FileIcon className="size-8" aria-hidden="true" />
      <span className="font-mono text-[9px] uppercase tracking-wider font-semibold">PDF</span>
    </div>
  ) : (
    <FileImage className="size-8 text-muted-foreground/50" aria-hidden="true" />
  );
}

export function MediaAssetResults({
  assets,
  loading,
  viewMode,
  selectedAssetId,
  selectedForBulk,
  onInspect,
  onToggleBulk,
}: MediaAssetResultsProps) {
  if (loading) {
    return <LoadingState message="Loading media assets…" className="min-h-72" />;
  }

  if (assets.length === 0) {
    return (
      <EmptyState
        icon={FileImage}
        title="No Media Assets Found"
        description="Try adjusting your search or filters, or drag and drop new files to upload."
        className="min-h-72"
      />
    );
  }

  if (viewMode === 'grid') {
    return (
      <TooltipProvider delay={200}>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
          aria-label="Media assets"
        >
          {assets.map((asset) => {
            const isSelected = selectedAssetId === asset.id;
            const isChecked = selectedForBulk.has(asset.id);
            const title = asset.title || asset.originalFilename;
            const hasDimensions = asset.widthPx && asset.heightPx;

            return (
              <article
                key={asset.id}
                className={`group relative min-w-0 overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow,background-color] duration-150 ${
                  isSelected
                    ? 'border-primary bg-primary-subtle ring-2 ring-primary/30 shadow-xs'
                    : 'border-border hover:border-primary/50 hover:shadow-2xs'
                }`}
              >
                {/* Clickable Card Body */}
                <button
                  type="button"
                  aria-label={`Inspect ${title}`}
                  aria-pressed={isSelected}
                  onClick={() => onInspect(asset.id)}
                  className="block w-full touch-manipulation text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {/* Thumbnail / Image Area */}
                  <div className="relative aspect-square w-full overflow-hidden bg-muted/60">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <AssetPreview asset={asset} rendition="card" />
                    </div>

                    {/* Bottom overlay: Dimensions and Status */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none gap-1">
                      {hasDimensions ? (
                        <span className="rounded bg-background/90 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-foreground backdrop-blur-xs shadow-2xs">
                          {asset.widthPx}×{asset.heightPx}
                        </span>
                      ) : (
                        <span className="rounded bg-background/90 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur-xs">
                          {asset.mimeType?.split('/')[1]?.toUpperCase() ?? asset.assetType}
                        </span>
                      )}

                      {asset.status !== 'READY' && (
                        <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground backdrop-blur-xs">
                          {asset.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Metadata info */}
                  <div className="min-w-0 space-y-1 p-2.5">
                    <Tooltip>
                      <TooltipTrigger>
                        <p className="truncate text-xs font-semibold text-foreground">
                          {title}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-xs">
                        <p className="font-semibold">{title}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{asset.originalFilename}</p>
                      </TooltipContent>
                    </Tooltip>

                    <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        {formatFileSize(asset.byteSize)}
                      </span>
                      <span
                        className={`font-mono tabular-nums px-1 rounded ${
                          asset.usages.length > 0
                            ? 'text-foreground bg-muted'
                            : 'text-muted-foreground/80'
                        }`}
                      >
                        {asset.usages.length > 0
                          ? `${asset.usages.length} use${asset.usages.length === 1 ? '' : 's'}`
                          : 'Unused'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Bulk Checkbox in top-left */}
                <div className="absolute left-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-background/90 backdrop-blur-xs shadow-2xs">
                  <Tooltip>
                    <TooltipTrigger>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => onToggleBulk(asset.id)}
                        aria-label={`Select ${title} for bulk actions`}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isChecked ? 'Deselect asset' : 'Select for bulk actions'}
                    </TooltipContent>
                  </Tooltip>
                </div>

                {/* Visibility Badge in top-right */}
                <Badge
                  variant="outline"
                  className={`absolute right-2 top-2 bg-background/90 backdrop-blur-xs text-[10px] shadow-2xs ${
                    asset.visibility === 'PUBLIC'
                      ? 'text-success border-success/30'
                      : 'text-muted-foreground'
                  }`}
                >
                  {asset.visibility === 'PUBLIC' ? 'Public' : 'Private'}
                </Badge>
              </article>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  // List View
  return (
    <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label="Media asset list" tabIndex={0}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Select</span>
            </TableHead>
            <TableHead className="w-14">Preview</TableHead>
            <TableHead>Asset Title & ID</TableHead>
            <TableHead>Resolution & Size</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Visibility</TableHead>
            <TableHead className="text-right">Usages</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => {
            const isSelected = selectedAssetId === asset.id;
            const isChecked = selectedForBulk.has(asset.id);
            const title = asset.title || asset.originalFilename;

            return (
              <TableRow
                key={asset.id}
                className={isSelected ? 'bg-primary-subtle' : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => onToggleBulk(asset.id)}
                    aria-label={`Select ${title} for bulk actions`}
                  />
                </TableCell>
                <TableCell>
                  <div className="relative flex size-10 items-center justify-center overflow-hidden rounded-md border bg-muted">
                    <AssetPreview asset={asset} rendition="thumbnail" />
                  </div>
                </TableCell>
                <TableCell className="min-w-44">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onInspect(asset.id)}
                    className="block max-w-sm touch-manipulation text-left text-xs font-semibold text-foreground hover:text-primary focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block truncate" title={title}>
                      {title}
                    </span>
                    <span className="block truncate font-mono text-[10px] font-normal text-muted-foreground">
                      {asset.id}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                  {asset.widthPx && asset.heightPx ? `${asset.widthPx}×${asset.heightPx} · ` : ''}
                  {formatFileSize(asset.byteSize)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={asset.status} />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={asset.visibility === 'PUBLIC' ? 'text-success border-success/30' : undefined}
                  >
                    {asset.visibility}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs ${
                      asset.usages.length > 0 ? 'bg-muted text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {asset.usages.length}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
