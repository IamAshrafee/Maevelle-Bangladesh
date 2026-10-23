'use client';

import {
  AlertCircle,
  Check,
  CheckCheck,
  Download,
  FileIcon,
  ImageIcon,
  Instagram,
  Loader2,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import * as React from 'react';

import type { AttachmentView, ChannelKind, MessageView } from '@maevelle/contracts/messaging';

import { Button } from '@/components/ui/button';
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from '@/components/ui/message';
import { cn } from '@/lib/utils';
import { formatFileSize, formatTime } from './format';
import type { PendingMessage } from './types';

export function HighlightedText({ text, query }: { text: string; query?: string | undefined }) {
  if (!query || !query.trim()) {
    return <>{text}</>;
  }
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={index} className="rounded-xs bg-warning/35 px-0.5 font-medium text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function AttachmentPreview({
  attachment,
  searchQuery,
}: {
  attachment: AttachmentView;
  searchQuery?: string | undefined;
}) {
  const isImage =
    attachment.kind === 'IMAGE' ||
    attachment.mimeType?.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|svg)$/i.test(attachment.fileName ?? '');

  const href = attachment.downloadPath;

  const isQuarantined =
    attachment.securityStatus === 'QUARANTINED' ||
    attachment.securityStatus === 'REJECTED' ||
    attachment.securityStatus === 'PURGED';

  if (isImage && !isQuarantined && href) {
    return (
      <div className="group/attachment relative mt-1.5 overflow-hidden rounded-lg border border-border bg-muted/40">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          title={attachment.fileName ?? 'View image'}
        >
          <img
            src={href}
            alt={attachment.fileName ?? 'Customer attachment'}
            loading="lazy"
            className="max-h-64 max-w-full rounded-md object-contain transition-opacity duration-150 hover:opacity-95 sm:max-h-80"
          />
        </a>
        <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-card/90 px-2.5 py-1 text-[11px] backdrop-blur-xs">
          <span className="truncate font-mono text-muted-foreground">
            {attachment.fileName ? (
              <HighlightedText text={attachment.fileName} query={searchQuery} />
            ) : (
              'Image'
            )}
            {attachment.byteSize ? ` · ${formatFileSize(attachment.byteSize)}` : ''}
          </span>
          <a
            href={href}
            download={attachment.fileName ?? 'image'}
            className="shrink-0 text-muted-foreground hover:text-foreground focus-visible:outline-none"
            title="Download image"
          >
            <Download className="size-3.5" />
            <span className="sr-only">Download</span>
          </a>
        </div>
      </div>
    );
  }

  if (attachment.kind === 'PROVIDER_SHARE') {
    return (
      <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary-subtle p-2.5 text-xs">
        <Instagram className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-medium">Instagram Shared Content</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Meta supplied share or story context. The original content may expire or require
            Instagram access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-2.5 text-xs shadow-2xs">
      <div className="flex min-w-0 items-center gap-2">
        {isQuarantined ? (
          <ShieldAlert className="size-4 shrink-0 text-destructive" />
        ) : (
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">
            {attachment.fileName ? (
              <HighlightedText text={attachment.fileName} query={searchQuery} />
            ) : (
              'Attachment'
            )}
          </p>
          <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {formatFileSize(attachment.byteSize)}
            {attachment.securityStatus !== 'AVAILABLE' &&
            attachment.securityStatus !== 'REMOTE_ONLY' ? (
              <span className="ml-1 text-warning">({attachment.securityStatus.toLowerCase()})</span>
            ) : null}
          </p>
        </div>
      </div>
      {!isQuarantined && href ? (
        <a
          href={href}
          download={attachment.fileName ?? 'attachment'}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          title="Download file"
        >
          <Download className="size-3.5" />
          <span className="sr-only">Download</span>
        </a>
      ) : null}
    </div>
  );
}

function DeliveryStatusIndicator({ delivery }: { delivery: MessageView['delivery'] }) {
  switch (delivery.state) {
    case 'READ':
      return (
        <span
          className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-primary"
          title="Read by customer"
        >
          <CheckCheck className="size-3" /> Read
        </span>
      );
    case 'DELIVERED':
      return (
        <span
          className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          title="Delivered to customer device"
        >
          <CheckCheck className="size-3" /> Delivered
        </span>
      );
    case 'SENT':
      return (
        <span
          className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          title="Sent to channel provider"
        >
          <Check className="size-3" /> Sent
        </span>
      );
    case 'FAILED_TRANSIENT':
    case 'FAILED_PERMANENT':
      return (
        <span
          className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-destructive"
          title={delivery.failureCode ?? 'Delivery failed'}
        >
          <AlertCircle className="size-3" />
          {delivery.failureCode === 'REPLY_WINDOW_CLOSED'
            ? 'Reply window closed'
            : delivery.failureCode === 'CONNECTION_DISCONNECTED'
              ? 'Disconnected'
              : delivery.failureCode === 'PERMISSION_MISSING'
                ? 'Permission missing'
                : 'Failed'}
        </span>
      );
    case 'UNKNOWN':
      return (
        <span
          className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-warning"
          title="Provider send confirmation pending reconciliation"
        >
          <AlertCircle className="size-3" /> Meta confirmation pending
        </span>
      );
    case 'SENDING':
    case 'QUEUED':
    default:
      return (
        <span className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          <Loader2 className="size-3 animate-spin" /> Sending…
        </span>
      );
  }
}

export interface TranscriptMessageItemProps {
  message: MessageView;
  channelKind?: ChannelKind | undefined;
  searchQuery?: string | undefined;
  isSearchMatch?: boolean | undefined;
  isTarget?: boolean | undefined;
}

export function TranscriptMessageItem({
  message,
  channelKind,
  searchQuery,
  isSearchMatch,
  isTarget,
}: TranscriptMessageItemProps) {
  const outbound = message.direction === 'OUTBOUND';
  const system = message.type === 'SYSTEM_EVENT';

  if (system) {
    return (
      <div
        id={`msg-${message.id}`}
        className={cn(
          'mx-auto max-w-md rounded-xl border border-dashed border-border bg-muted/50 px-3 py-1.5 text-center text-xs text-muted-foreground transition-colors duration-200',
          isTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          isSearchMatch && 'bg-warning/20 border-warning/40',
        )}
      >
        <span>
          <HighlightedText text={message.text ?? 'System notification'} query={searchQuery} />
        </span>
        <time className="ml-2 font-mono text-[10px] tabular-nums opacity-75">
          {formatTime(message.createdAt)}
        </time>
      </div>
    );
  }

  const isProviderPage =
    message.sender.type === 'PROVIDER' || (message.sender as { role?: string }).role === 'PAGE';
  const senderName =
    message.sender.name ??
    (isProviderPage
      ? channelKind === 'INSTAGRAM'
        ? 'Instagram Account'
        : 'Facebook Page'
      : outbound
        ? 'Maevelle Staff'
        : 'Customer');
  const initials = isProviderPage
    ? channelKind === 'INSTAGRAM'
      ? 'IG'
      : 'FB'
    : senderName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase() || (outbound ? 'M' : 'C');

  return (
    <Message
      id={`msg-${message.id}`}
      align={outbound ? 'end' : 'start'}
      className={cn(
        'group/msg rounded-xl transition-colors duration-150',
        isTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isSearchMatch && 'bg-warning/10 p-1',
      )}
    >
      <MessageAvatar
        className={cn(
          'size-7 text-xs font-semibold select-none',
          isProviderPage
            ? channelKind === 'INSTAGRAM'
              ? 'border border-primary/20 bg-primary-subtle text-primary'
              : 'bg-[#1877f2]/10 text-[#1877f2] border border-[#1877f2]/30'
            : outbound
              ? 'bg-primary/15 text-primary border border-primary/20'
              : 'bg-muted text-muted-foreground border border-border',
        )}
        aria-hidden="true"
      >
        {initials}
      </MessageAvatar>

      <MessageContent className={cn('max-w-[85%] sm:max-w-[78%]')}>
        <MessageHeader className="gap-2">
          <span className="truncate font-medium text-foreground">{senderName}</span>
          <time className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTime(message.createdAt)}
          </time>
        </MessageHeader>

        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-sm shadow-2xs leading-relaxed',
            outbound
              ? 'rounded-tr-xs border border-primary/25 bg-primary-subtle text-foreground'
              : 'rounded-tl-xs border border-border bg-card text-foreground',
          )}
        >
          {message.text ? (
            <p className="whitespace-pre-wrap break-words">
              <HighlightedText text={message.text} query={searchQuery} />
            </p>
          ) : null}

          {message.attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              searchQuery={searchQuery}
            />
          ))}
        </div>

        <MessageFooter className="gap-2">
          {outbound ? <DeliveryStatusIndicator delivery={message.delivery} /> : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export interface TranscriptPendingItemProps {
  pending: PendingMessage;
  onRetry: (key: string) => void;
  onDismiss: (key: string) => void;
}

export function TranscriptPendingItem({ pending, onRetry, onDismiss }: TranscriptPendingItemProps) {
  const isFailed = pending.state === 'REJECTED' || pending.state === 'UNCERTAIN';

  return (
    <Message
      id={`pending-${pending.key}`}
      align="end"
      className="group/pending opacity-85 transition-opacity duration-150"
    >
      <MessageAvatar
        className="size-7 border border-primary/20 bg-primary/10 text-xs font-semibold text-primary select-none"
        aria-hidden="true"
      >
        M
      </MessageAvatar>

      <MessageContent className="max-w-[85%] sm:max-w-[78%]">
        <MessageHeader className="gap-2 justify-end">
          <span className="truncate font-medium text-foreground">You</span>
          <time className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatTime(pending.createdAt)}
          </time>
        </MessageHeader>

        <div className="rounded-2xl rounded-tr-xs border border-primary/25 bg-primary-subtle px-3.5 py-2.5 text-sm text-foreground shadow-2xs leading-relaxed">
          {pending.text ? <p className="whitespace-pre-wrap break-words">{pending.text}</p> : null}
          {pending.attachmentIds.length ? (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3.5" />
              <span>
                {pending.attachmentIds.length} image
                {pending.attachmentIds.length > 1 ? 's' : ''} attached
              </span>
            </div>
          ) : null}
        </div>

        <MessageFooter className="gap-2 justify-end">
          {pending.state === 'SENDING' ? (
            <span className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Sending…
            </span>
          ) : isFailed ? (
            <div className="flex items-center gap-2 font-mono text-[10px] tabular-nums text-destructive">
              <span className="flex items-center gap-1">
                <AlertCircle className="size-3" />
                {pending.error ?? 'Send failed'}
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="h-5 px-1.5 text-[10px] text-foreground hover:bg-muted"
                onClick={() => onRetry(pending.key)}
              >
                <RefreshCw className="mr-1 size-2.5" /> Retry
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={() => onDismiss(pending.key)}
                aria-label="Dismiss failed message"
              >
                <X className="size-3" />
              </Button>
            </div>
          ) : null}
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}
