'use client';

import { Download, FileText, Plus, Trash2 } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getAdminMediaUrl } from '@/lib/media/api';
import { formatAssetDate, humanizeAssetCode } from '@/lib/assets/format';
import { isTerminalAsset } from '../types';

interface AssetFilesTabProps {
  asset: AssetDetailDto;
  canManage: boolean;
  onAttachFile: () => void;
  onDetachFile: (linkId: string, filename: string) => void;
}

export function AssetFilesTab({
  asset,
  canManage,
  onAttachFile,
  onDetachFile,
}: AssetFilesTabProps) {
  const terminal = isTerminalAsset(asset.status);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Private Documents & Photos</CardTitle>
          <CardDescription>
            Confidential vendor invoices, warranty slips, serial tags, and inspection photos.
          </CardDescription>
        </div>

        {canManage && !terminal ? (
          <Button onClick={onAttachFile} size="sm">
            <Plus className="size-4 mr-1.5" />
            <span>Attach File</span>
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        {asset.media.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
            <FileText className="size-8 mx-auto text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No Attached Documents</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No invoices, warranty papers, or asset photos have been uploaded for this item.
              </p>
            </div>
            {canManage && !terminal ? (
              <Button onClick={onAttachFile} variant="outline" size="sm">
                <Plus className="size-4 mr-1.5" />
                Attach First Document
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {asset.media.map((file) => {
              const isImage = file.assetType === 'IMAGE';
              const downloadUrl = getAdminMediaUrl(file.mediaAssetId, { download: true });
              const previewUrl = getAdminMediaUrl(file.mediaAssetId, { rendition: 'card' });

              return (
                <div
                  key={file.id}
                  className="rounded-xl border bg-card overflow-hidden hover:border-primary/50 transition-all flex flex-col justify-between group shadow-xs"
                >
                  {/* Thumbnail / Header Area */}
                  {isImage ? (
                    <div className="relative aspect-video w-full bg-muted/40 overflow-hidden">
                      <img
                        src={previewUrl}
                        alt={file.label ?? file.filename}
                        className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <span className="absolute top-2 left-2 rounded-full bg-background/80 backdrop-blur-xs px-2 py-0.5 text-[10px] font-semibold">
                        {humanizeAssetCode(file.role)}
                      </span>
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/20 border-b flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="size-6 text-primary shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {humanizeAssetCode(file.role)}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
                        Document
                      </span>
                    </div>
                  )}

                  {/* Metadata and Actions */}
                  <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                    <div>
                      <strong className="text-sm font-semibold text-foreground line-clamp-1 block">
                        {file.label ?? file.filename}
                      </strong>
                      <p className="text-xs text-muted-foreground truncate mt-0.5 font-mono">
                        {file.filename}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Attached {formatAssetDate(file.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t text-xs">
                      <a
                        href={downloadUrl}
                        download
                        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                      >
                        <Download className="size-3.5" />
                        <span>Download / View</span>
                      </a>

                      {canManage && !terminal ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => onDetachFile(file.id, file.label ?? file.filename)}
                          title="Detach file"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
