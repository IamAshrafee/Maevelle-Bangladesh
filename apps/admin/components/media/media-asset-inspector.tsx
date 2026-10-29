'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Archive,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileIcon,
  FileImage,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StatusBadge } from '@/components/status-badge';
import { getAdminMediaUrl } from '@/lib/media/api';

import { formatFileSize } from './media-file-size';
import { MediaMetadataForm } from './media-metadata-form';
import { MediaOrganizationForm } from './media-organization-form';
import { MediaPlacementForm } from './media-placement-form';
import type {
  MediaAsset,
  MediaFolder,
  MediaTag,
  MediaUsage,
  PlacementScope,
  ProductSummary,
  ProductWorkspace,
  RenditionChoice,
} from './media-workspace-types';

export interface MediaAssetInspectorProps {
  readonly selectedAsset: MediaAsset | undefined;
  readonly busy: boolean;
  readonly folders: readonly MediaFolder[];
  readonly tags: readonly MediaTag[];
  readonly products: readonly ProductSummary[];
  readonly productLoadError: string | null;
  readonly product: ProductWorkspace | null;
  readonly placementScope: PlacementScope;
  readonly setPlacementScope: (scope: PlacementScope) => void;
  readonly selectProduct: (productId: string) => Promise<void>;
  readonly saveMetadata: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly saveOrganization: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly attach: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly detach: (usage: MediaUsage) => Promise<void>;
  readonly runAssetAction: (
    action:
      | 'retry'
      | 'retry-import'
      | 'repair-renditions'
      | 'retry-purge'
      | 'archive'
      | 'trash'
      | 'restore',
  ) => Promise<void>;
  readonly onCopyPublicUrl: () => void;
  readonly onOpenNewFolder?: () => void;
  readonly onOpenNewTag?: () => void;
  readonly onClose?: () => void;
}

export function MediaAssetInspector({
  selectedAsset,
  busy,
  folders,
  tags,
  products,
  productLoadError,
  product,
  placementScope,
  setPlacementScope,
  selectProduct,
  saveMetadata,
  saveOrganization,
  attach,
  detach,
  runAssetAction,
  onCopyPublicUrl,
  onOpenNewFolder,
  onOpenNewTag,
  onClose,
}: MediaAssetInspectorProps) {
  const [activeRendition, setActiveRendition] = useState<RenditionChoice>('pdp');
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const handleCopyId = () => {
    if (!selectedAsset) return;
    void navigator.clipboard.writeText(selectedAsset.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyPublicUrl = () => {
    onCopyPublicUrl();
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <TooltipProvider delay={200}>
      <aside
        id="media-inspector"
        tabIndex={-1}
        role="region"
        aria-label="Asset inspector"
        className="space-y-4 rounded-xl focus-visible:ring-2 focus-visible:ring-ring lg:col-span-4"
      >
        {selectedAsset ? (
          <Card className="shadow-xs lg:sticky lg:top-4 overflow-hidden border-border bg-card">
            {/* Header */}
            <CardHeader className="p-4 border-b border-border space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-sm font-semibold truncate text-foreground" title={selectedAsset.title || selectedAsset.originalFilename}>
                    {selectedAsset.title || selectedAsset.originalFilename}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground mt-0.5">
                    <span className="truncate">{selectedAsset.id}</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <button
                          type="button"
                          onClick={handleCopyId}
                          className="hover:text-foreground p-0.5 rounded transition-colors"
                          aria-label="Copy Asset ID"
                        >
                          {copiedId ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {copiedId ? 'Copied ID!' : 'Copy Asset ID'}
                      </TooltipContent>
                    </Tooltip>
                  </CardDescription>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <StatusBadge status={selectedAsset.status} />
                  {onClose && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 lg:hidden text-muted-foreground"
                      onClick={onClose}
                      aria-label="Close inspector"
                    >
                      <X className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto">
              {/* Preview Area */}
              <div className="space-y-2">
                <div className="aspect-4/3 relative w-full overflow-hidden rounded-lg border border-border bg-muted/40">
                  {selectedAsset.assetType === 'IMAGE' && selectedAsset.status === 'READY' ? (
                    <Image
                      src={getAdminMediaUrl(selectedAsset.id, { rendition: activeRendition })}
                      alt={selectedAsset.altText || ''}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-muted-foreground text-center">
                      {selectedAsset.assetType === 'DOCUMENT' ? (
                        <>
                          <FileIcon className="size-10 text-primary" />
                          <span className="text-xs font-semibold text-foreground">
                            {selectedAsset.originalFilename}
                          </span>
                          <span className="text-[11px] font-mono">{selectedAsset.mimeType}</span>
                        </>
                      ) : (
                        <>
                          <FileImage className="size-10 text-muted-foreground/50" />
                          <span className="text-xs font-semibold">Status: {selectedAsset.status}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Rendition Selector for Images */}
                {selectedAsset.assetType === 'IMAGE' && selectedAsset.status === 'READY' && (
                  <div className="flex items-center justify-between gap-1 pt-1">
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                      Rendition:
                    </span>
                    <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
                      {(['pdp', 'card', 'thumbnail', 'zoom', 'original'] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setActiveRendition(r)}
                          className={`px-2 py-0.5 text-[10px] font-mono rounded transition-colors ${
                            activeRendition === r
                              ? 'bg-card text-foreground font-semibold shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {r.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Toolbar: Download, Copy URL */}
              <div className="flex items-center gap-2">
                <Button
                  render={
                    <a
                      href={getAdminMediaUrl(selectedAsset.id, {
                        rendition: 'original',
                        download: true,
                      })}
                      download={selectedAsset.originalFilename}
                    />
                  }
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 text-xs gap-1.5"
                >
                  <Download className="size-3.5" /> Download Original
                </Button>

                {selectedAsset.assetType === 'IMAGE' &&
                  selectedAsset.visibility === 'PUBLIC' &&
                  ['READY', 'ARCHIVED'].includes(selectedAsset.status) && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs px-2.5 gap-1.5"
                          onClick={handleCopyPublicUrl}
                          aria-label="Copy Public Delivery URL"
                        >
                          {copiedUrl ? (
                            <Check className="size-3.5 text-success" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          <span className="hidden sm:inline">Public URL</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {copiedUrl ? 'Copied Public URL!' : 'Copy public storefront URL'}
                      </TooltipContent>
                    </Tooltip>
                  )}
              </div>

              {/* Status Diagnostic Warnings */}
              {selectedAsset.status === 'PURGING' && (
                <div className="rounded-lg border border-border bg-muted/60 p-3 text-xs space-y-1">
                  <p className="font-semibold text-foreground">
                    Purge in Progress (Attempt {selectedAsset.purgeAttempts})
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    {selectedAsset.purgeLeaseUntil
                      ? 'Storage deletion active. Interrupted claims are recovered automatically.'
                      : selectedAsset.purgeRetryAfter
                        ? `Next retry scheduled for ${new Date(selectedAsset.purgeRetryAfter).toLocaleString()}`
                        : 'Awaiting background purge worker.'}
                  </p>
                  {selectedAsset.purgeLastError && (
                    <p className="text-destructive text-[11px] break-words">
                      Last error: {selectedAsset.purgeLastError}
                    </p>
                  )}
                  {selectedAsset.purgeLastError && !selectedAsset.purgeLeaseUntil && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-xs"
                      onClick={() => void runAssetAction('retry-purge')}
                      disabled={busy}
                    >
                      <RotateCw className="size-3 mr-1" /> Retry Purge Now
                    </Button>
                  )}
                </div>
              )}

              {selectedAsset.status !== 'READY' && selectedAsset.status !== 'PURGING' && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning space-y-1">
                  <p className="font-semibold">Processing State: {selectedAsset.status}</p>
                  <p className="text-[11px]">
                    {selectedAsset.processingErrorMessage ||
                      (selectedAsset.externalImport?.status === 'RETRY_WAIT'
                        ? `Import retry ${selectedAsset.externalImport.attempts} scheduled for ${selectedAsset.externalImport.nextAttemptAt ? new Date(selectedAsset.externalImport.nextAttemptAt).toLocaleString() : 'soon'}.`
                        : selectedAsset.externalImport?.status === 'PROCESSING'
                          ? 'Validating and streaming external image bytes.'
                          : 'Derivatives are being processed by the background worker.')}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedAsset.status === 'FAILED' &&
                      selectedAsset.processingErrorCode !== 'EXTERNAL_IMPORT_FAILED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 bg-card text-foreground"
                          onClick={() => void runAssetAction('retry')}
                          disabled={busy}
                        >
                          <RotateCw className="size-3" /> Retry Processing
                        </Button>
                      )}
                    {selectedAsset.status === 'FAILED' &&
                      selectedAsset.processingErrorCode === 'EXTERNAL_IMPORT_FAILED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 bg-card text-foreground"
                          onClick={() => void runAssetAction('retry-import')}
                          disabled={busy}
                        >
                          <RotateCw className="size-3" /> Retry Import
                        </Button>
                      )}
                  </div>
                </div>
              )}

              {/* Organized Inspector Tabs */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
                  <TabsTrigger value="catalog">Catalog</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                {/* Tab 1: Details & Metadata */}
                <TabsContent value="details" className="space-y-4 pt-3">
                  {/* Technical Specifications */}
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs space-y-1.5 font-mono">
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Resolution:</span>
                      <span className="font-semibold text-foreground">
                        {selectedAsset.widthPx && selectedAsset.heightPx
                          ? `${selectedAsset.widthPx} × ${selectedAsset.heightPx} px`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>File Size:</span>
                      <span className="font-semibold text-foreground">
                        {formatFileSize(selectedAsset.byteSize)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Format:</span>
                      <span className="font-semibold text-foreground">
                        {selectedAsset.mimeType ?? 'Unknown'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Created:</span>
                      <span className="text-foreground">
                        {new Date(selectedAsset.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <MediaMetadataForm
                    selectedAsset={selectedAsset}
                    busy={busy}
                    saveMetadata={saveMetadata}
                  />

                  {/* Lifecycle actions */}
                  <div className="border-t border-border pt-3 space-y-2">
                    <span className="text-[11px] font-medium text-muted-foreground block">
                      Lifecycle Management
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedAsset.status === 'READY' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => void runAssetAction('archive')}
                          disabled={busy}
                        >
                          <Archive className="size-3" /> Archive
                        </Button>
                      )}

                      {selectedAsset.status === 'ARCHIVED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => void runAssetAction('restore')}
                          disabled={busy}
                        >
                          <RotateCw className="size-3" /> Unarchive
                        </Button>
                      )}

                      {selectedAsset.status === 'TRASHED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs gap-1"
                          onClick={() => void runAssetAction('restore')}
                          disabled={busy}
                        >
                          <RotateCw className="size-3" /> Restore from Trash
                        </Button>
                      )}

                      {selectedAsset.usages.length === 0 &&
                        ['READY', 'ARCHIVED', 'FAILED'].includes(selectedAsset.status) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 text-xs gap-1"
                            onClick={() => void runAssetAction('trash')}
                            disabled={busy}
                          >
                            <Trash2 className="size-3" /> Trash Asset
                          </Button>
                        )}
                    </div>
                  </div>
                </TabsContent>

                {/* Tab 2: Taxonomy & Folders */}
                <TabsContent value="taxonomy" className="pt-3">
                  <MediaOrganizationForm
                    selectedAsset={selectedAsset}
                    busy={busy}
                    folders={folders}
                    tags={tags}
                    saveOrganization={saveOrganization}
                    onOpenNewFolder={onOpenNewFolder}
                    onOpenNewTag={onOpenNewTag}
                  />
                </TabsContent>

                {/* Tab 3: Catalog Product Placements */}
                <TabsContent value="catalog" className="space-y-4 pt-3">
                  {/* Current Active Placements List */}
                  {selectedAsset.usages.filter((u) => u.productId).length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-foreground">Active Placements</h4>
                      <div className="space-y-1.5">
                        {selectedAsset.usages
                          .filter((u) => u.productId)
                          .map((u) => (
                            <div
                              key={u.id}
                              className="flex items-center justify-between rounded-lg border border-border p-2 text-xs bg-muted/20"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-foreground truncate">
                                  {u.productTitle ?? u.label}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono">
                                  {u.role ?? 'GALLERY'}
                                  {u.position !== undefined ? ` · Pos ${u.position}` : ''}
                                  {u.variantSku ? ` · SKU: ${u.variantSku}` : ''}
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-8 p-0 text-destructive hover:bg-destructive/10"
                                onClick={() => void detach(u)}
                                title="Detach placement"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border pt-3">
                    <h4 className="text-xs font-semibold text-foreground mb-3">Attach to Product</h4>
                    <MediaPlacementForm
                      selectedAsset={selectedAsset}
                      busy={busy}
                      products={products}
                      productLoadError={productLoadError}
                      product={product}
                      placementScope={placementScope}
                      setPlacementScope={setPlacementScope}
                      selectProduct={selectProduct}
                      attach={attach}
                    />
                  </div>
                </TabsContent>

                {/* Tab 4: Activity & Health */}
                <TabsContent value="activity" className="space-y-4 pt-3">
                  {/* Usages Breakdown */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-foreground">Store Usages</h4>
                    {selectedAsset.usages.length === 0 ? (
                      <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs text-muted-foreground text-center">
                        This asset is unattached. It can be safely moved to trash.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedAsset.usages.map((u) => (
                          <div
                            key={u.id}
                            className="rounded-lg border border-border p-2.5 text-xs bg-muted/20 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">
                                {u.domain.toUpperCase()}
                              </Badge>
                              {u.productId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1 text-[11px] text-destructive hover:bg-destructive/10"
                                  onClick={() => void detach(u)}
                                >
                                  Detach
                                </Button>
                              )}
                            </div>
                            <p className="font-semibold text-foreground">
                              {u.productTitle ?? u.label ?? u.domain}
                            </p>
                            {u.conversationId && (
                              <Link
                                href={`/messaging?conversation=${encodeURIComponent(u.conversationId)}`}
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                              >
                                <span>Open chat thread</span>
                                <ExternalLink className="size-3" />
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Public Rendition Status */}
                  {selectedAsset.missingPublicRenditions && (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning space-y-2">
                      <p className="font-semibold">Missing Public Rendition Variants</p>
                      <p className="text-[11px]">
                        Some WebP derivatives required for storefront rendering are missing.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 bg-card text-foreground"
                        onClick={() => void runAssetAction('repair-renditions')}
                        disabled={busy}
                      >
                        <RotateCw className="size-3" /> Regenerate Public Sizes
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-xs p-8 text-center text-muted-foreground border-dashed border-border bg-card">
            <FileImage className="size-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">No Asset Selected</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Click any image or file in the library to inspect technical details, switch renditions,
              or assign placements.
            </p>
          </Card>
        )}
      </aside>
    </TooltipProvider>
  );
}
