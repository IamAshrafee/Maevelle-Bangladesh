'use client';

import type {
  CursorPage,
  MessageView,
  MessagingEvent,
  StorefrontAttachmentUploadView,
  StorefrontChatBootstrap,
  StorefrontChatConfig,
  StorefrontConversationView,
} from '@maevelle/contracts';

import type { ChatPageContext, ContactDetails } from './types';

const ROOT = '/api/storefront/v1/chat';

export class ChatApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ChatApiError';
  }
}

async function responseError(response: Response): Promise<ChatApiError> {
  const body = (await response.json().catch(() => undefined)) as
    { error?: { code?: string; message?: string } } | undefined;
  const retry = Number(response.headers.get('retry-after'));
  return new ChatApiError(
    response.status,
    body?.error?.code ?? 'REQUEST_FAILED',
    body?.error?.message ?? 'The request could not be completed.',
    Number.isFinite(retry) && retry > 0 ? retry : null,
  );
}

async function envelope<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: { accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw await responseError(response);
  const body = (await response.json()) as { data: T };
  return body.data;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function wireContext(context: ChatPageContext) {
  return {
    pageType: context.pageType,
    path: context.path,
    ...(context.productId ? { productId: context.productId } : {}),
    ...(context.variantId ? { variantId: context.variantId } : {}),
  };
}

export const chatApi = {
  config: () => envelope<StorefrontChatConfig>(`${ROOT}/config`),
  bootstrap: (context: ChatPageContext) =>
    envelope<StorefrontChatBootstrap>(
      `${ROOT}/session`,
      json('POST', { context: wireContext(context) }),
    ),
  currentConversation: () => envelope<StorefrontConversationView>(`${ROOT}/conversations/current`),
  startConversation: (context: ChatPageContext) =>
    envelope<StorefrontConversationView>(
      `${ROOT}/conversations`,
      json('POST', { context: wireContext(context) }),
    ),
  messages: async (conversationId: string, before?: string) => {
    const query = new URLSearchParams({ limit: '30' });
    if (before) query.set('before', before);
    const response = await fetch(
      `${ROOT}/conversations/${encodeURIComponent(conversationId)}/messages?${query}`,
      { credentials: 'include', cache: 'no-store', headers: { accept: 'application/json' } },
    );
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as CursorPage<MessageView>;
  },
  send: (
    conversationId: string,
    input: {
      readonly clientMessageId: string;
      readonly idempotencyKey: string;
      readonly text?: string;
      readonly attachmentIds?: readonly string[];
      readonly context?: ChatPageContext;
    },
  ) =>
    envelope<MessageView>(`${ROOT}/conversations/${encodeURIComponent(conversationId)}/messages`, {
      ...json('POST', {
        clientMessageId: input.clientMessageId,
        ...(input.text ? { text: input.text } : {}),
        ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
        ...(input.context ? { context: wireContext(input.context) } : {}),
      }),
      headers: { 'content-type': 'application/json', 'idempotency-key': input.idempotencyKey },
    }),
  read: (conversationId: string, lastReadSequence: string) =>
    envelope<{ lastReadSequence: string }>(
      `${ROOT}/conversations/${encodeURIComponent(conversationId)}/read`,
      json('POST', { lastReadSequence }),
    ),
  reopen: (conversationId: string) =>
    envelope<StorefrontConversationView>(
      `${ROOT}/conversations/${encodeURIComponent(conversationId)}/reopen`,
      json('POST'),
    ),
  updateContact: (details: ContactDetails) =>
    envelope<{ updated: true }>(`${ROOT}/contact`, json('PATCH', details)),
};

type UploadAuthorization = {
  readonly id: string;
  readonly assetId: string;
  readonly upload: {
    readonly strategy: 'API_PROXY' | 'SIGNED_PUT';
    readonly url: string;
    readonly method: 'PUT';
    readonly headers: Readonly<Record<string, string>>;
    readonly expiresAt: string;
  };
};

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadChatImage(
  conversationId: string,
  file: File,
  signal?: AbortSignal,
  onStatus?: (status: 'hashing' | 'uploading' | 'processing') => void,
): Promise<StorefrontAttachmentUploadView> {
  onStatus?.('hashing');
  const sha256 = await checksum(file);
  const authorization = await envelope<UploadAuthorization>(`${ROOT}/uploads`, {
    ...json('POST', {
      conversationId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
      sha256,
    }),
    ...(signal ? { signal } : {}),
  });
  onStatus?.('uploading');
  const uploadResponse = await fetch(authorization.upload.url, {
    method: authorization.upload.method,
    headers: authorization.upload.headers,
    body: file,
    ...(signal ? { signal } : {}),
    ...(authorization.upload.strategy === 'API_PROXY' ? { credentials: 'include' as const } : {}),
  });
  if (!uploadResponse.ok) throw await responseError(uploadResponse);
  onStatus?.('processing');
  let status = await envelope<StorefrontAttachmentUploadView>(
    `${ROOT}/uploads/${encodeURIComponent(authorization.id)}/complete`,
    { ...json('POST'), ...(signal ? { signal } : {}) },
  );
  for (
    let attempt = 0;
    attempt < 40 && ['PENDING', 'PROCESSING'].includes(status.status);
    attempt++
  ) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, Math.min(1000 + attempt * 250, 3000));
      signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
    status = await envelope<StorefrontAttachmentUploadView>(
      `${ROOT}/uploads/${encodeURIComponent(authorization.id)}`,
      signal ? { signal } : undefined,
    );
  }
  if (status.status !== 'AVAILABLE')
    throw new ChatApiError(422, 'ATTACHMENT_NOT_READY', 'The image could not be prepared.');
  return status;
}

export async function streamChatEvents(input: {
  readonly cursor: string | null;
  readonly signal: AbortSignal;
  readonly onEvent: (event: MessagingEvent) => void;
}): Promise<void> {
  const query = input.cursor ? `?cursor=${encodeURIComponent(input.cursor)}` : '';
  const response = await fetch(`${ROOT}/events${query}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: { accept: 'text/event-stream' },
    signal: input.signal,
  });
  if (!response.ok) throw await responseError(response);
  if (!response.body)
    throw new ChatApiError(502, 'STREAM_UNAVAILABLE', 'Live updates are unavailable.');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (!input.signal.aborted) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += value;
    let boundary = /\r?\n\r?\n/.exec(buffer);
    while (boundary?.index !== undefined) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      const data = block
        .split(/\r?\n/)
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim();
      if (data) input.onEvent(JSON.parse(data) as MessagingEvent);
      boundary = /\r?\n\r?\n/.exec(buffer);
    }
  }
}
