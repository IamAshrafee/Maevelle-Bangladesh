'use client';

import { useEffect, useState } from 'react';

import { cx } from '@/components/ui/classnames';

export function PrivateChatImage({
  alt,
  className,
  path,
  onClick,
}: {
  readonly alt: string;
  readonly className?: string;
  readonly path: string;
  readonly onClick?: (blobUrl: string) => void;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void fetch(path, { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Image unavailable');
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed)
    return (
      <div
        className={cx(
          'grid aspect-square place-items-center rounded-xl bg-surface-container text-center text-body-sm text-on-surface-variant',
          className,
        )}
      >
        Image unavailable
      </div>
    );
  if (!source)
    return (
      <div
        aria-label="Loading private image"
        className={cx('aspect-square animate-pulse rounded-xl bg-surface-container', className)}
      />
    );
  return (
    <img
      alt={alt}
      className={cx(
        'aspect-square rounded-xl object-cover',
        onClick && 'cursor-pointer transition-opacity duration-150 hover:opacity-90',
        className,
      )}
      onClick={onClick ? () => onClick(source) : undefined}
      src={source}
    />
  );
}
