'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/classnames';
import { CloseIcon, ImageIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/textarea';

import type { AttachmentDraft } from './types';

function newDraft(file: File): AttachmentDraft {
  return {
    localId: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    status: 'selected',
    uploadId: null,
    error: null,
  };
}

export function Composer({
  acceptsAttachments,
  disabled,
  maximumBytes,
  maximumCount,
  maximumTextLength,
  onSend,
}: {
  readonly acceptsAttachments: boolean;
  readonly disabled: boolean;
  readonly maximumBytes: number;
  readonly maximumCount: number;
  readonly maximumTextLength: number;
  readonly onSend: (
    text: string,
    attachments: readonly AttachmentDraft[],
    update: (localId: string, patch: Partial<AttachmentDraft>) => void,
  ) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<readonly AttachmentDraft[]>([]);
  const [validation, setValidation] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentRef = useRef(attachments);
  attachmentRef.current = attachments;

  useEffect(
    () => () => {
      for (const attachment of attachmentRef.current) URL.revokeObjectURL(attachment.previewUrl);
    },
    [],
  );

  const update = (localId: string, patch: Partial<AttachmentDraft>) => {
    setAttachments((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  };

  const handleProcessFiles = useCallback(
    (selectedFiles: readonly File[]) => {
      if (!selectedFiles.length) return;

      if (attachments.length + selectedFiles.length > maximumCount) {
        setValidation(`You can attach up to ${maximumCount} images per message.`);
        return;
      }

      const invalid = selectedFiles.find(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > maximumBytes,
      );

      if (invalid) {
        setValidation(
          `Choose JPEG, PNG or WebP images up to ${Math.round(maximumBytes / 1_048_576)} MB each.`,
        );
        return;
      }

      setValidation(null);
      setAttachments((current) => [...current, ...selectedFiles.map(newDraft)]);
    },
    [attachments.length, maximumBytes, maximumCount],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardFiles = Array.from(event.clipboardData.files);
      const imageFiles = clipboardFiles.filter((file) => file.type.startsWith('image/'));

      if (imageFiles.length > 0 && acceptsAttachments) {
        event.preventDefault();
        handleProcessFiles(imageFiles);
      }
    },
    [acceptsAttachments, handleProcessFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingOver(false);

      if (disabled || sending || !acceptsAttachments) return;

      const droppedFiles = Array.from(event.dataTransfer.files).filter((file) =>
        file.type.startsWith('image/'),
      );
      handleProcessFiles(droppedFiles);
    },
    [acceptsAttachments, disabled, handleProcessFiles, sending],
  );

  async function submit() {
    if (sending || disabled) return;
    if (!text.trim() && !attachments.length) {
      setValidation('Write a message or attach an image.');
      return;
    }
    setValidation(null);
    setSending(true);
    const accepted = await onSend(text, attachments, update);
    setSending(false);
    if (accepted) {
      setText('');
      for (const attachment of attachments) URL.revokeObjectURL(attachment.previewUrl);
      setAttachments([]);
      textareaRef.current?.focus();
    }
  }

  const isNearLimit = text.length > maximumTextLength - 200;

  return (
    <div
      className={cx(
        'border-t border-border-subtle bg-surface-container-lowest px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 transition-colors duration-150 sm:rounded-b-3xl sm:px-4 sm:pb-4',
        isDraggingOver && 'border-primary/50 bg-primary-subtle/20 ring-2 ring-primary/30',
      )}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {attachments.length ? (
        <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <div className="relative w-20 shrink-0" key={attachment.localId}>
              <img
                alt={attachment.file.name}
                className="aspect-square w-20 rounded-xl border border-border object-cover"
                src={attachment.previewUrl}
              />
              <button
                aria-label={`Remove ${attachment.file.name}`}
                className="absolute -right-1 -top-1 grid size-7 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface shadow-sm transition-transform duration-120 hover:scale-105 active:scale-95"
                disabled={sending}
                onClick={() => {
                  URL.revokeObjectURL(attachment.previewUrl);
                  setAttachments((current) =>
                    current.filter((item) => item.localId !== attachment.localId),
                  );
                }}
                type="button"
              >
                <CloseIcon size={12} />
              </button>
              <span className="mt-1 block truncate text-label-sm text-on-surface-variant tabular-nums">
                {attachment.status === 'selected'
                  ? 'Ready'
                  : attachment.status === 'uploading'
                    ? 'Uploading…'
                    : attachment.status === 'processing'
                      ? 'Processing…'
                      : attachment.status === 'failed'
                        ? 'Failed'
                        : attachment.status}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        {acceptsAttachments ? (
          <>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={disabled || sending}
              multiple
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = '';
                handleProcessFiles(selected);
              }}
              ref={fileInput}
              type="file"
            />
            <button
              aria-label="Attach images"
              className="grid size-12 shrink-0 place-items-center rounded-xl border border-border-subtle bg-surface-container-low text-primary transition-colors duration-150 hover:bg-primary-subtle active:scale-98 disabled:opacity-50"
              disabled={disabled || sending || attachments.length >= maximumCount}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <ImageIcon size={22} />
            </button>
          </>
        ) : null}

        <div className="relative min-w-0 flex-1">
          <Textarea
            aria-describedby={validation ? 'chat-composer-error' : undefined}
            aria-label="Message"
            className="max-h-32 min-h-12 resize-none"
            disabled={disabled || sending}
            maxLength={maximumTextLength}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                event.nativeEvent.isComposing === false &&
                window.matchMedia('(pointer: fine)').matches
              ) {
                event.preventDefault();
                void submit();
              }
            }}
            onPaste={handlePaste}
            placeholder={
              acceptsAttachments ? 'Type your message or paste an image…' : 'Type your message…'
            }
            ref={textareaRef}
            rows={1}
            sizeVariant="compact"
            value={text}
          />
          {isNearLimit ? (
            <span className="absolute bottom-1 right-2 text-label-sm text-on-surface-variant tabular-nums">
              {text.length}/{maximumTextLength}
            </span>
          ) : null}
        </div>

        <Button
          aria-label="Send message"
          className="size-12 shrink-0 px-0"
          disabled={disabled || (!text.trim() && !attachments.length)}
          loading={sending}
          onClick={() => void submit()}
        >
          <span aria-hidden="true" className="font-semibold">
            Send
          </span>
        </Button>
      </div>

      {validation ? (
        <p className="mt-2 text-body-sm font-medium text-danger" id="chat-composer-error" role="alert">
          {validation}
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center justify-between text-label-sm text-on-surface-variant">
        <span>Enter to send · Shift+Enter for new line</span>
        {attachments.length > 0 ? (
          <span className="tabular-nums">
            {attachments.length}/{maximumCount} images
          </span>
        ) : null}
      </div>
    </div>
  );
}
