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
  readonly width: number | null;
  readonly height: number | null;
  readonly securityStatus:
    'UPLOADING' | 'QUARANTINED' | 'AVAILABLE' | 'REJECTED' | 'PURGED' | 'REMOTE_ONLY';
  /** Authorization is still required; this is not a public object-storage URL. */
  readonly downloadPath: string | null;
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
  readonly isStarred?: boolean;
  readonly tags?: readonly MessagingTag[];
  readonly followUp?: ConversationFollowUpSummary | null;
  readonly needsReply?: boolean;
  readonly capabilities: ChannelCapabilities;
  readonly version: string;
}

export interface MessagingTag {
  readonly id: string;
  readonly label: string;
  readonly colorToken: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: string;
}

export interface ConversationFollowUpSummary {
  readonly id: string;
  readonly dueAt: string;
  readonly status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  readonly responsibleMembershipId: string;
  readonly isOverdue: boolean;
}

export interface InternalNoteView {
  readonly id: string;
  readonly conversationId: string;
  readonly author: { readonly membershipId: string; readonly displayName: string };
  readonly body: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface SavedReplyView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly shortcut: string | null;
  readonly category: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AgentAvailabilityView {
  readonly membershipId: string;
  readonly displayName: string;
  readonly status: 'ONLINE' | 'BUSY' | 'AWAY' | 'OFFLINE';
  readonly capacity: number;
  readonly lastHeartbeatAt: string | null;
  readonly effectiveStatus: 'ONLINE' | 'BUSY' | 'AWAY' | 'OFFLINE';
  readonly version: string;
}

export interface BusinessHoursView {
  readonly id: string;
  readonly connectionId: string | null;
  readonly timezone: string;
  readonly weeklySchedule: Readonly<Record<string, readonly { start: string; end: string }[]>>;
  readonly exceptions: readonly {
    readonly id: string;
    readonly localDate: string;
    readonly intervals: readonly { start: string; end: string }[];
    readonly isClosed: boolean;
    readonly label: string | null;
  }[];
  readonly offlineAcceptsMessages: boolean;
  readonly manualClosureUntil: string | null;
  readonly version: string;
}

export interface FollowUpView extends ConversationFollowUpSummary {
  readonly conversationId: string;
  readonly note: string | null;
  readonly createdByMembershipId: string;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
  readonly reminderSentAt: string | null;
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConversationActivityView {
  readonly id: string;
  readonly type: string;
  readonly actorMembershipId: string | null;
  readonly actorDisplayName: string | null;
  readonly fromValue: unknown;
  readonly toValue: unknown;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface InboxCounts {
  readonly all: number;
  readonly mine: number;
  readonly unassigned: number;
  readonly unread: number;
  readonly new: number;
  readonly open: number;
  readonly pending: number;
  readonly resolved: number;
  readonly closed: number;
  readonly needingReply: number;
  readonly pendingFollowUps: number;
  readonly overdueFollowUps: number;
}

export interface MessagingReportSummary {
  readonly from: string;
  readonly to: string;
  readonly totals: Readonly<Record<string, number>>;
  readonly response: {
    readonly firstResponseCount: number;
    readonly averageFirstResponseSeconds: number | null;
    readonly resolutionCount: number;
    readonly averageResolutionSeconds: number | null;
  };
  readonly byChannel: readonly { readonly channelKind: ChannelKind; readonly count: number }[];
  readonly byAgent: readonly {
    readonly membershipId: string;
    readonly displayName: string;
    readonly assigned: number;
    readonly outboundMessages: number;
  }[];
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
  readonly clientMessageId: string | null;
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

export type StorefrontChatAvailability = 'AVAILABLE' | 'OFFLINE' | 'DISABLED';

export interface StorefrontChatConfig {
  readonly enabled: boolean;
  readonly availability: StorefrontChatAvailability;
  readonly acceptsMessages: boolean;
  readonly greeting: string;
  readonly offlineMessage: string;
  readonly capabilities: ChannelCapabilities;
  readonly attachmentPolicy: {
    readonly mimeTypes: readonly ('image/jpeg' | 'image/png' | 'image/webp')[];
    readonly maximumBytes: number;
    readonly maximumCount: number;
  };
}

export interface StorefrontVisitorSessionView {
  readonly id: string;
  readonly status: 'ACTIVE';
  readonly expiresAt: string;
  readonly isCustomerLinked: boolean;
}

export interface StorefrontConversationView {
  readonly id: string;
  readonly status: ConversationStatus;
  readonly lastMessageSequence: string;
  readonly lastReadSequence: string;
  readonly capabilities: ChannelCapabilities;
  readonly context: StorefrontConversationContext | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StorefrontConversationContext {
  readonly pageType: 'HOME' | 'PRODUCT' | 'CATEGORY' | 'CART' | 'CHECKOUT' | 'OTHER';
  readonly path: string;
  readonly productId: string | null;
  readonly variantId: string | null;
  readonly productTitle: string | null;
  readonly capturedAt: string;
}

export interface StorefrontChatBootstrap {
  readonly config: StorefrontChatConfig;
  readonly session: StorefrontVisitorSessionView;
  readonly conversation: StorefrontConversationView;
}

export interface StorefrontAttachmentUploadView {
  readonly id: string;
  readonly assetId: string;
  readonly conversationId: string;
  readonly status: 'PENDING' | 'PROCESSING' | 'AVAILABLE' | 'REJECTED' | 'EXPIRED' | 'ATTACHED';
  readonly fileName: string;
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly byteSize: number;
  readonly expiresAt: string;
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

export type FacebookConnectionStatus =
  | 'AUTHORIZATION_PENDING'
  | 'CONNECTED'
  | 'LIMITED_PERMISSIONS'
  | 'WEBHOOK_INCOMPLETE'
  | 'NEEDS_REAUTHORIZATION'
  | 'SUSPENDED'
  | 'DISCONNECTED'
  | 'ERROR';

export interface FacebookIntegrationAvailability {
  readonly configured: boolean;
  readonly graphApiVersion: string | null;
  readonly requiredScopes: readonly string[];
  readonly oauthCallbackUrl: string | null;
}

export interface FacebookEligiblePage {
  readonly pageId: string;
  readonly name: string;
  readonly category: string | null;
  readonly tasks: readonly string[];
  readonly grantedScopes: readonly string[];
  readonly isEligible: boolean;
  readonly ineligibilityReasons: readonly string[];
}

export interface FacebookConnectionView {
  readonly id: string;
  readonly pageId: string;
  readonly pageName: string;
  readonly status: FacebookConnectionStatus;
  readonly graphApiVersion: string;
  readonly grantedScopes: readonly string[];
  readonly missingScopes: readonly string[];
  readonly subscribedFields: readonly string[];
  readonly webhookSubscriptionHealthy: boolean;
  readonly credentialHealthy: boolean;
  readonly lastWebhookAt: string | null;
  readonly lastInboundAt: string | null;
  readonly lastOutboundAt: string | null;
  readonly lastVerifiedAt: string | null;
  readonly lastErrorCode: string | null;
  readonly disconnectedAt: string | null;
  readonly version: string;
}

export interface FacebookOAuthStartView {
  readonly authorizationUrl: string;
  readonly attemptId: string;
  readonly expiresAt: string;
}

export interface FacebookOAuthStatusView {
  readonly attemptId: string;
  readonly status: 'PENDING' | 'AUTHORIZED' | 'CONSUMED' | 'FAILED' | 'EXPIRED';
  readonly pages: readonly FacebookEligiblePage[];
  readonly errorCode: string | null;
  readonly expiresAt: string;
}

export interface FacebookReplyEligibility {
  readonly allowed: boolean;
  readonly reason:
    | 'ELIGIBLE'
    | 'NO_CUSTOMER_MESSAGE'
    | 'WINDOW_CLOSED'
    | 'CONNECTION_UNAVAILABLE'
    | 'PERMISSION_MISSING'
    | 'UNSUPPORTED_CONTENT';
  readonly eligibleUntil: string | null;
  readonly supportedAttachmentMimeTypes: readonly string[];
  readonly nextAction: 'REPLY' | 'WAIT_FOR_CUSTOMER' | 'REAUTHORIZE' | 'CONTACT_UNAVAILABLE';
}

export interface FacebookSyncView {
  readonly id: string;
  readonly connectionId: string;
  readonly status: 'PENDING' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  readonly importedConversations: number;
  readonly importedMessages: number;
  readonly errorCount: number;
  readonly lastErrorCode: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}
