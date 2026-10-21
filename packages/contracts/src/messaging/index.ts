export type ChannelKind = 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';
export type ConversationStatus = 'NEW' | 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
export type ConversationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type MessageDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type MessageDeliveryState =
  | 'RECEIVED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT'
  | 'UNKNOWN';

export interface ChannelCapabilities {
  readonly text: boolean;
  readonly attachments: boolean;
  readonly replies: boolean;
  readonly readReceipts: boolean;
  readonly maximumTextLength: number;
}

export interface AttachmentView {
  readonly id: string;
  readonly kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'PROVIDER_SHARE';
  readonly fileName: string | null;
  readonly mimeType: string | null;
  readonly byteSize: string | null;
  readonly securityStatus:
    'UPLOADING' | 'QUARANTINED' | 'AVAILABLE' | 'REJECTED' | 'PURGED' | 'REMOTE_ONLY';
}

export interface ConversationSummary {
  readonly id: string;
  readonly channel: {
    readonly kind: ChannelKind;
    readonly connectionId: string;
    readonly name: string;
  };
  readonly contact: {
    readonly id: string;
    readonly displayName: string | null;
    readonly customerId: string | null;
  };
  readonly status: ConversationStatus;
  readonly priority: ConversationPriority;
  readonly assignee: { readonly membershipId: string; readonly displayName: string } | null;
  readonly lastMessage: {
    readonly sequence: string;
    readonly preview: string;
    readonly direction: MessageDirection;
    readonly createdAt: string;
  } | null;
  readonly unreadCount: number;
  readonly capabilities: ChannelCapabilities;
  readonly version: string;
}

export interface ConversationDetail extends ConversationSummary {
  readonly subject: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replyEligibleUntil: string | null;
}

export interface MessageView {
  readonly id: string;
  readonly conversationId: string;
  readonly sequence: string;
  readonly direction: MessageDirection;
  readonly sender: {
    readonly type: 'CONTACT' | 'STAFF' | 'SYSTEM' | 'PROVIDER';
    readonly id: string | null;
    readonly name: string | null;
  };
  readonly type: 'TEXT' | 'ATTACHMENT' | 'MIXED' | 'SYSTEM_EVENT';
  readonly text: string | null;
  readonly attachments: readonly AttachmentView[];
  readonly delivery: {
    readonly state: MessageDeliveryState;
    readonly failureCode?: string;
    readonly canRetry: boolean;
  };
  readonly createdAt: string;
  readonly editedAt: string | null;
  readonly retractedAt: string | null;
}

export interface MessagingEvent {
  readonly eventId: string;
  readonly cursor: string;
  readonly type: string;
  readonly conversationId: string | null;
  readonly aggregateId: string;
  readonly aggregateVersion: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

export interface CursorPage<T> {
  readonly data: readonly T[];
  readonly pagination: { readonly nextCursor: string | null; readonly hasMore: boolean };
}

export type DeliveryOutcome =
  | {
      readonly type: 'ACCEPTED';
      readonly providerMessageId: string;
      readonly providerRequestId?: string;
    }
  | { readonly type: 'TRANSIENT_FAILURE'; readonly code: string; readonly retryAfter?: string }
  | { readonly type: 'PERMANENT_FAILURE'; readonly code: string; readonly safeMessage: string }
  | { readonly type: 'UNKNOWN'; readonly code: string; readonly reconciliationKey?: string };

export interface MessagingErrorBody {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
    readonly requestId?: string;
  };
}
