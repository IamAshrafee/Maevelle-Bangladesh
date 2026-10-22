'use client';

import { useEffect, useRef } from 'react';

import { CloseIcon, DownloadIcon } from '@/components/ui/icons';

export interface ImageLightboxProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly imageSrc: string;
  readonly altText: string;
  readonly fileName?: string | null | undefined;
  readonly downloadPath?: string | null | undefined;
}

export function ImageLightbox({
  isOpen,
  onClose,
  imageSrc,
  altText,
  fileName,
  downloadPath,
}: ImageLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      aria-label="Image preview"
      aria-modal="true"
      className="fixed inset-0 z-60 flex flex-col items-center justify-between bg-black/85 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      {/* Top action bar */}
      <div className="flex w-full max-w-4xl items-center justify-between gap-4 pt-2 text-white">
        <span className="truncate text-body-sm font-medium text-white/80">
          {fileName ?? altText}
        </span>
        <button
          aria-label="Close image preview"
          className="grid size-12 place-items-center rounded-full bg-white/10 text-white transition-colors duration-150 hover:bg-white/20 active:scale-98"
          onClick={onClose}
          type="button"
        >
          <CloseIcon size={22} />
        </button>
      </div>

      {/* Main Image */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <img
          alt={altText}
          className="max-h-[75dvh] max-w-full rounded-2xl object-contain shadow-modal"
          src={imageSrc}
        />
      </div>

      {/* Bottom controls */}
      <div className="flex w-full max-w-4xl items-center justify-center pb-2">
        {downloadPath ? (
          <a
            aria-label="Download original image"
            className="flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-label-md font-semibold text-white transition-colors duration-150 hover:bg-white/25 active:scale-98"
            download={fileName ?? 'chat-image'}
            href={downloadPath}
            rel="noreferrer"
            target="_blank"
          >
            <DownloadIcon size={18} />
            <span>Download</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
