'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
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
  const fileInput = useRef<HTMLInputElement>(null);
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
    }
  }

  return (
    <div className="border-t border-border-subtle bg-surface-container-lowest px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 sm:rounded-b-3xl sm:px-4 sm:pb-4">
      {attachments.length ? (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {attachments.map((attachment) => (
            <div className="relative w-20 shrink-0" key={attachment.localId}>
              <img
                alt={attachment.file.name}
                className="aspect-square w-20 rounded-xl border border-border object-cover"
                src={attachment.previewUrl}
              />
              <button
                aria-label={`Remove ${attachment.file.name}`}
                className="absolute -right-1 -top-1 grid size-8 place-items-center rounded-full bg-inverse-surface text-inverse-on-surface shadow-sm"
                disabled={sending}
                onClick={() => {
                  URL.revokeObjectURL(attachment.previewUrl);
                  setAttachments((current) =>
                    current.filter((item) => item.localId !== attachment.localId),
                  );
                }}
                type="button"
              >
                <CloseIcon size={14} />
              </button>
              <span className="mt-1 block truncate text-label-sm text-on-surface-variant">
                {attachment.status === 'selected'
                  ? 'Ready'
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
                const selected = [...(event.target.files ?? [])];
                event.target.value = '';
                if (attachments.length + selected.length > maximumCount) {
                  setValidation(`You can attach up to ${maximumCount} images.`);
                  return;
                }
                const invalid = selected.find(
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
                setAttachments((current) => [...current, ...selected.map(newDraft)]);
              }}
              ref={fileInput}
              type="file"
            />
            <button
              aria-label="Attach images"
              className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-surface-container-low text-xl text-primary hover:bg-primary-subtle disabled:opacity-50"
              disabled={disabled || sending || attachments.length >= maximumCount}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              +
            </button>
          </>
        ) : null}
        <Textarea
          aria-describedby={validation ? 'chat-composer-error' : undefined}
          aria-label="Message"
          className="max-h-32"
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
          placeholder="Type your message…"
          rows={1}
          sizeVariant="compact"
          value={text}
        />
        <Button
          aria-label="Send message"
          className="size-12 px-0"
          disabled={disabled || (!text.trim() && !attachments.length)}
          loading={sending}
          onClick={() => void submit()}
        >
          <span aria-hidden="true">Send</span>
        </Button>
      </div>
      {validation ? (
        <p className="mt-2 text-body-sm text-danger" id="chat-composer-error" role="alert">
          {validation}
        </p>
      ) : null}
      <p className="mt-1.5 text-label-sm text-on-surface-variant">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
