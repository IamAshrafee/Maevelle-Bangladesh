'use client';

import {
  ImageIcon,
  Loader2,
  Star,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import Image from 'next/image';
import { type DragEvent, useRef, useState } from 'react';

import type { ApiEnvelope, CatalogProductMediaDto } from '@maevelle/contracts';
import type { ProductEditorSectionProps } from '@/components/products/product-editor-types';
import { Button } from '@/components/ui/button';
import { catalogData, catalogRequest, productMediaUrl } from '@/lib/catalog/api';

type MediaAsset = { id: string };

function GallerySection({
  title,
  description,
  media,
  onUpload,
  onRemove,
  onMakePrimary,
  isUploading,
}: {
  title: string;
  description: string;
  media: CatalogProductMediaDto[];
  onUpload: (files: FileList) => void;
  onRemove: (mediaId: string) => void;
  onMakePrimary: (m: CatalogProductMediaDto) => void;
  isUploading: boolean;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files);
    }
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b bg-muted/20 px-4 py-3">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      
      <div className="p-4">
        <div 
          className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 ${dragActive ? 'bg-primary/5' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {media.map((m) => (
            <div key={m.id} className="group relative aspect-square rounded-lg border bg-muted overflow-hidden">
              <Image
                alt={m.altText ?? ''}
                className="object-cover"
                fill
                sizes="150px"
                src={productMediaUrl(m.assetId, m.visibility)}
                unoptimized
              />
              
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!m.isPrimary && (
                  <button
                    type="button"
                    title="Make Primary"
                    className="p-1.5 bg-background text-foreground rounded-full hover:scale-110 transition-transform"
                    onClick={() => onMakePrimary(m)}
                  >
                    <Star className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  title="Remove"
                  className="p-1.5 bg-destructive text-destructive-foreground rounded-full hover:scale-110 transition-transform"
                  onClick={() => onRemove(m.id)}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>

              {m.isPrimary && (
                <div className="absolute top-2 left-2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded-sm font-bold flex items-center gap-1">
                  <Star className="size-3 fill-current" /> PRIMARY
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors ${dragActive ? 'border-primary text-primary' : 'border-muted-foreground/25'}`}
          >
            {isUploading ? (
              <Loader2 className="size-6 animate-spin mb-2" />
            ) : (
              <UploadCloud className="size-6 mb-2" />
            )}
            <span className="text-xs font-medium px-2 text-center">
              {isUploading ? 'Uploading...' : 'Click or drop files'}
            </span>
          </button>
          
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                onUpload(e.target.files);
              }
              // reset so same file can be selected again if needed
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function ProductMediaForm({
  workspace,
  onRefresh,
  onMessage,
}: ProductEditorSectionProps) {
  const [uploadingScope, setUploadingScope] = useState<string | null>(null);

  const mainMedia = workspace.media.filter(m => !m.variantId && !m.optionValueId);
  const colorAxes = workspace.options.filter(a => a.name.toLowerCase() === 'color' || a.name.toLowerCase() === 'colour');
  const colorOptions = colorAxes.flatMap(a => a.values);

  async function handleUpload(files: FileList, scopeType: 'PRODUCT' | 'OPTION', optionValueId?: string) {
    const scopeId = scopeType === 'PRODUCT' ? 'product' : `option:${optionValueId}`;
    setUploadingScope(scopeId);
    
    try {
      const filesArray = Array.from(files);
      const uploadedAssets: string[] = [];
      
      // Upload each file
      for (const file of filesArray) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) continue;
        
        const response = await catalogRequest<ApiEnvelope<MediaAsset>>('/admin/media/images', {
          method: 'POST',
          headers: { 'x-media-visibility': 'public' },
          body: file,
        });
        
        uploadedAssets.push(response.data.id);
        
        // Patch basic metadata
        await catalogData(`/admin/media/${response.data.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: file.name.replace(/\.[^.]+$/, '').replaceAll('-', ' '),
            altText: workspace.title,
            visibility: 'PUBLIC',
          }),
        });
      }

      // Attach each uploaded file to the product
      for (const [position, assetId] of uploadedAssets.entries()) {
        const payload: any = {
          assetId,
          role: scopeType === 'OPTION' ? 'COLOR_GALLERY' : 'GALLERY',
          position: workspace.media.length + position,
          isPrimary: position === 0 && mainMedia.length === 0, // Make primary if it's the first one ever
        };
        
        if (scopeType === 'OPTION') {
          payload.optionValueId = optionValueId;
        }

        await catalogData(`/admin/catalog/products/${workspace.id}/media`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      await onRefresh(`${uploadedAssets.length} image(s) attached.`);
    } catch (caught) {
      onMessage(caught instanceof Error ? caught.message : 'Images could not be uploaded.');
    } finally {
      setUploadingScope(null);
    }
  }

  async function handleRemove(mediaId: string) {
    if (!window.confirm('Remove this image from the gallery?')) return;
    try {
      await catalogData(`/admin/catalog/products/${workspace.id}/media/${mediaId}`, {
        method: 'DELETE',
      });
      await onRefresh('Image removed.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not remove image.');
    }
  }

  async function handleMakePrimary(m: CatalogProductMediaDto) {
    try {
      const payload: any = {
        assetId: m.assetId,
        role: m.role,
        position: m.position,
        isPrimary: true,
      };
      
      if (m.variantId) payload.variantId = m.variantId;
      if (m.optionValueId) payload.optionValueId = m.optionValueId;

      await catalogData(`/admin/catalog/products/${workspace.id}/media`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await onRefresh('Primary image updated.');
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Could not update primary image.');
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          Product Galleries
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Drag and drop images directly into the appropriate gallery to upload and attach them instantly.
        </p>
      </header>

      <GallerySection
        title="Main Product Gallery"
        description="Shown on the product detail page regardless of variant selected."
        media={mainMedia.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)}
        onUpload={(files) => handleUpload(files, 'PRODUCT')}
        onRemove={handleRemove}
        onMakePrimary={handleMakePrimary}
        isUploading={uploadingScope === 'product'}
      />

      {colorOptions.map((opt) => (
        <GallerySection
          key={opt.id}
          title={`${opt.label} Gallery`}
          description={`Images specific to the ${opt.label} color option.`}
          media={workspace.media
            .filter(m => m.optionValueId === opt.id)
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.position - b.position)}
          onUpload={(files) => handleUpload(files, 'OPTION', opt.id)}
          onRemove={handleRemove}
          onMakePrimary={handleMakePrimary}
          isUploading={uploadingScope === `option:${opt.id}`}
        />
      ))}
    </div>
  );
}
