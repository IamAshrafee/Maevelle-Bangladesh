import type { MessageView, StorefrontConversationContext } from '@maevelle/contracts';

export type ChatPageContext = Omit<StorefrontConversationContext, 'capturedAt' | 'productTitle'> & {
  readonly productTitle?: string | null;
};

export type PendingMessageState = 'sending' | 'uncertain' | 'rejected';

export interface PendingMessage {
  readonly clientMessageId: string;
  readonly idempotencyKey: string;
  readonly text: string | null;
  readonly previewUrls: readonly string[];
  readonly attachmentIds: readonly string[];
  readonly createdAt: string;
  readonly state: PendingMessageState;
  readonly error: string | null;
}

export interface ChatMessageItem {
  readonly key: string;
  readonly canonical: MessageView | null;
  readonly pending: PendingMessage | null;
}

export type AttachmentDraftStatus =
  'selected' | 'hashing' | 'uploading' | 'processing' | 'ready' | 'failed';

export interface AttachmentDraft {
  readonly localId: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly status: AttachmentDraftStatus;
  readonly uploadId: string | null;
  readonly error: string | null;
}

export interface ContactDetails {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly emailConsent: boolean;
  readonly phoneConsent: boolean;
}
