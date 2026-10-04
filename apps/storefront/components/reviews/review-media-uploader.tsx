'use client';

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react';

export interface UploadedMediaItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly assetId?: string | undefined;
  readonly status: 'pending' | 'uploading' | 'processing' | 'ready' | 'error';
  readonly progress?: number | undefined;
  readonly errorMessage?: string | undefined;
}

export interface ReviewMediaUploaderProps {
  readonly organizationId: string;
  readonly accessToken: string;
  readonly mediaItems: readonly UploadedMediaItem[];
  readonly onMediaItemsChange: (items: readonly UploadedMediaItem[]) => void;
  readonly maxItems?: number | undefined;
  readonly disabled?: boolean | undefined;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReviewMediaUploader({
  organizationId,
  accessToken,
  mediaItems,
  onMediaItemsChange,
  maxItems = 5,
  disabled = false,
}: ReviewMediaUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [generalError, setGeneralError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = mediaItems.length < maxItems && !disabled;

  async function processAndUploadFile(file: File, itemId: string) {
    // 1. Validation
    if (!ACCEPTED_TYPES.includes(file.type)) {
      updateItem(itemId, {
        status: 'error',
        errorMessage: 'Only JPEG, PNG, or WebP images are supported.',
      });
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      updateItem(itemId, {
        status: 'error',
        errorMessage: `Photo exceeds the 5 MB limit (${formatBytes(file.size)}).`,
      });
      return;
    }

    try {
      updateItem(itemId, { status: 'uploading', progress: 20 });

      // Step 1: Authorize upload session
      const sessionResponse = await fetch('/api/reviews/media/uploads', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          accessToken,
          filename: file.name,
          mimeType: file.type,
          byteSize: file.size,
        }),
      });

      if (!sessionResponse.ok) {
        const errPayload = await sessionResponse.json().catch(() => undefined);
        throw new Error(errPayload?.error?.message ?? 'Upload authorization failed.');
      }

      const session = (await sessionResponse.json()) as {
        data: {
          sessionId: string;
          assetId: string;
          upload: {
            strategy: 'SIGNED_PUT' | 'API_PROXY';
            url: string;
            method: 'PUT';
            headers: Record<string, string>;
          };
        };
      };

      updateItem(itemId, {
        status: 'uploading',
        progress: 60,
        assetId: session.data.assetId,
      });

      // Step 2: Upload binary content
      const uploadHeaders = new Headers(session.data.upload.headers);
      if (session.data.upload.strategy === 'API_PROXY') {
        uploadHeaders.set('x-review-access-token', accessToken);
      }

      const uploadResponse = await fetch(session.data.upload.url, {
        method: 'PUT',
        headers: uploadHeaders,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Photo content upload failed.');
      }

      updateItem(itemId, { status: 'processing', progress: 85 });

      // Step 3: Complete upload session
      const completionResponse = await fetch(
        `/api/reviews/media/uploads/${session.data.sessionId}/complete`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ organizationId, accessToken }),
        },
      );

      if (!completionResponse.ok) {
        throw new Error('Upload verification failed.');
      }

      // Step 4: Poll asset readiness
      const timeoutAt = Date.now() + 60_000;
      let ready = false;

      while (Date.now() < timeoutAt) {
        const statusResponse = await fetch(
          `/api/reviews/media/${session.data.assetId}/status?organizationId=${encodeURIComponent(organizationId)}`,
          { headers: { 'x-review-access-token': accessToken }, cache: 'no-store' },
        );

        if (statusResponse.ok) {
          const statusResult = (await statusResponse.json()) as {
            data: { status: string; errorMessage: string | null };
          };

          if (statusResult.data.status === 'READY') {
            ready = true;
            break;
          }
          if (['FAILED', 'QUARANTINED'].includes(statusResult.data.status)) {
            throw new Error(
              statusResult.data.errorMessage ?? 'Photo failed safety inspection.',
            );
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!ready) {
        throw new Error('Photo processing timed out.');
      }

      updateItem(itemId, {
        status: 'ready',
        progress: 100,
        assetId: session.data.assetId,
      });
    } catch (err) {
      updateItem(itemId, {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Photo upload failed.',
      });
    }
  }

  function updateItem(id: string, patch: Partial<UploadedMediaItem>) {
    onMediaItemsChange(
      mediaItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function handleFiles(files: FileList | File[]) {
    setGeneralError('');
    const fileArray = Array.from(files);

    if (mediaItems.length + fileArray.length > maxItems) {
      setGeneralError(`You can attach up to ${maxItems} photos in total.`);
      return;
    }

    const newItems: UploadedMediaItem[] = fileArray.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
    }));

    onMediaItemsChange([...mediaItems, ...newItems]);

    // Start uploads concurrently
    for (const item of newItems) {
      void processAndUploadFile(item.file, item.id);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (!canAddMore) return;
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }

  function removeItem(id: string) {
    const item = mediaItems.find((m) => m.id === id);
    if (item?.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    onMediaItemsChange(mediaItems.filter((m) => m.id !== id));
  }

  function retryItem(item: UploadedMediaItem) {
    updateItem(item.id, { status: 'pending', errorMessage: undefined });
    void processAndUploadFile(item.file, item.id);
  }

  return (
    <div className="review-media-uploader-root">
      <div className="uploader-header">
        <label className="uploader-title">
          Customer Photos <span className="uploader-optional">(Optional)</span>
        </label>
        <span className="uploader-count-indicator">
          {mediaItems.length} of {maxItems} photos
        </span>
      </div>

      <p className="uploader-guidelines">
        Attach up to {maxItems} real photos (JPEG, PNG, WebP up to 5 MB each).
      </p>

      {generalError ? (
        <p className="uploader-error-alert" role="alert">
          {generalError}
        </p>
      ) : null}

      {/* Uploaded Items Grid */}
      {mediaItems.length > 0 ? (
        <div className="uploaded-media-grid">
          {mediaItems.map((item) => (
            <div
              key={item.id}
              className={`uploaded-item-card ${item.status === 'error' ? 'has-error' : ''}`}
            >
              <div className="uploaded-thumb-wrapper">
                <img src={item.previewUrl} alt={item.file.name} className="uploaded-thumb-img" />

                {item.status === 'uploading' || item.status === 'processing' ? (
                  <div className="item-overlay-status">
                    <div className="mini-spinner" aria-hidden="true" />
                    <span>{item.status === 'uploading' ? 'Uploading…' : 'Processing…'}</span>
                  </div>
                ) : null}

                {item.status === 'ready' ? (
                  <span className="item-ready-check" title="Photo verified and ready">
                    ✓
                  </span>
                ) : null}

                <button
                  type="button"
                  className="item-remove-btn"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove photo ${item.file.name}`}
                  disabled={disabled}
                >
                  ✕
                </button>
              </div>

              <div className="uploaded-item-meta">
                <span className="item-filename truncate" title={item.file.name}>
                  {item.file.name}
                </span>
                <span className="item-filesize">{formatBytes(item.file.size)}</span>
              </div>

              {item.errorMessage ? (
                <div className="item-error-row">
                  <span className="item-error-text">{item.errorMessage}</span>
                  <button
                    type="button"
                    className="item-retry-btn"
                    onClick={() => retryItem(item)}
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Drag & Drop Target Area */}
      {canAddMore ? (
        <div
          className={`uploader-dropzone ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              fileInputRef.current?.click();
            }
          }}
          aria-label="Upload photos. Click or drag and drop files here."
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleInputChange}
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: 'none' }}
          />

          <div className="dropzone-content">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="dropzone-icon"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div className="dropzone-text">
              <span className="dropzone-action">Click to upload photos</span> or drag and drop
            </div>
            <span className="dropzone-hint">JPEG, PNG, WebP up to 5 MB</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
