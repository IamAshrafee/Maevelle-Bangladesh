import type {
  CustomerCrmProfileDto,
  CustomerDetailDto,
  CustomerIdentityLinkDto,
  CustomerSummaryDto,
  OrderSummaryDto,
} from '@maevelle/contracts';
import type {
  AgentAvailabilityView,
  BusinessHoursView,
  ChannelKind,
  ConversationDetail,
  ConversationPriority,
  ConversationStatus,
  ConversationSummary,
  FollowUpView,
  InternalNoteView,
  MessageView,
  MessagingReportSummary,
  MessagingTag,
  SavedReplyView,
} from '@maevelle/contracts/messaging';

export type WorkspaceView = 'inbox' | 'follow-ups' | 'reports' | 'settings';
export type ConversationScope = 'mine' | 'unassigned' | 'all';
export type InboxSort =
  'newest' | 'oldest' | 'created_newest' | 'created_oldest' | 'priority' | 'follow_up';

export interface InboxFilters {
  readonly scope: ConversationScope;
  readonly status?: ConversationStatus;
  readonly channelKind?: ChannelKind;
  readonly priority?: ConversationPriority;
  readonly assignedMembershipId?: string;
  readonly tagId?: string;
  readonly unread?: boolean;
  readonly starred?: boolean;
  readonly needsReply?: boolean;
  readonly followUp?: 'pending' | 'overdue' | 'none';
  readonly search?: string;
  readonly sort: InboxSort;
}

export interface PendingMessage {
  readonly key: string;
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly idempotencyKey: string;
  readonly text: string;
  readonly attachmentIds: readonly string[];
  readonly createdAt: string;
  readonly state: 'SENDING' | 'UNCERTAIN' | 'REJECTED';
  readonly error?: string;
}

export interface AssignmentHistoryView {
  readonly id: string;
  readonly previousAssigneeMembershipId: string | null;
  readonly newAssigneeMembershipId: string | null;
  readonly actorMembershipId: string;
  readonly source: string;
  readonly reason: string | null;
  readonly conversationVersion: string;
  readonly createdAt: string;
}

export interface AssignmentRuleView {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly isEnabled: boolean;
  readonly conditions: Readonly<Record<string, unknown>>;
  readonly actions: Readonly<Record<string, unknown>>;
  readonly version: string;
}

export interface ChannelSettingsView {
  readonly id: string;
  readonly channelKind: ChannelKind;
  readonly displayName: string;
  readonly status: string;
  readonly enabled: boolean;
  readonly acceptsOfflineMessages: boolean;
  readonly greeting: string;
  readonly offlineMessage: string;
  readonly version: string;
}

export interface MessagingContactSearchView {
  readonly id: string;
  readonly displayName: string | null;
  readonly customerId: string | null;
  readonly linkStatus: string;
  readonly identity: {
    readonly channelKind: string;
    readonly displayName: string | null;
    readonly username: string | null;
    readonly lastSeenAt: string;
  };
}

export interface MessagingCustomerContextView {
  readonly conversationId: string;
  readonly linkStatus: 'LINKED' | 'UNLINKED';
  readonly customer: CustomerDetailDto | null;
  readonly crmProfile: CustomerCrmProfileDto | null;
  readonly linkedIdentities: readonly CustomerIdentityLinkDto[];
  readonly orders: readonly {
    readonly id: string;
    readonly orderNumber: string;
    readonly status: string;
    readonly totalAmount: string;
    readonly currencyCode: string;
    readonly createdAt: string;
  }[];
  readonly commerceOrders: {
    readonly data: readonly OrderSummaryDto[];
    readonly pagination: {
      readonly page: number;
      readonly pageSize: number;
      readonly totalItems: number;
      readonly totalPages: number;
    };
  };
  readonly returns: readonly {
    readonly id: string;
    readonly caseNumber: string;
    readonly status: string;
    readonly returnType: string;
    readonly orderNumber: string;
    readonly createdAt: string;
  }[];
  readonly productContext: readonly {
    readonly pageType: string;
    readonly path: string;
    readonly productId: string | null;
    readonly variantId: string | null;
    readonly productTitle: string | null;
    readonly capturedAt: string;
  }[];
}

export interface NotificationPreferenceView {
  readonly notification_type: string;
  readonly channel: string;
  readonly enabled: boolean;
}

export interface StaffAttachmentUploadView {
  readonly assetId: string;
  readonly sessionId: string;
  readonly status: 'PENDING_UPLOAD' | 'UPLOADED' | 'PROCESSING' | 'AVAILABLE' | 'REJECTED';
  readonly upload?: {
    readonly strategy: 'API_PROXY' | 'SIGNED_URL';
    readonly url: string;
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
  };
  readonly errorMessage?: string | null;
}

export interface MessagingWorkspaceData {
  readonly conversations: readonly ConversationSummary[];
  readonly conversation: ConversationDetail | null;
  readonly messages: readonly MessageView[];
  readonly pendingMessages: readonly PendingMessage[];
  readonly notes: readonly InternalNoteView[];
  readonly followUps: readonly FollowUpView[];
  readonly tags: readonly MessagingTag[];
  readonly savedReplies: readonly SavedReplyView[];
  readonly agents: readonly AgentAvailabilityView[];
  readonly report: MessagingReportSummary | null;
  readonly businessHours: BusinessHoursView | null;
  readonly customerContext: MessagingCustomerContextView | null;
}

export type { CustomerSummaryDto };
