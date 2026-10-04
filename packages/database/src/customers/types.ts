import type { CustomerSource, CustomerSummary } from '../customers.js';

export type CustomerRestrictionType =
  | 'ORDERING_BLOCKED'
  | 'COD_RESTRICTED'
  | 'ORDER_REVIEW_REQUIRED';

export type CustomerRestrictionStatus = 'ACTIVE' | 'LIFTED' | 'EXPIRED';

export interface CustomerRestriction {
  readonly id: string;
  readonly customerId: string;
  readonly restrictionType: CustomerRestrictionType;
  readonly status: CustomerRestrictionStatus;
  readonly reason: string;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt?: string | null;
  readonly liftedAt?: string | null;
  readonly liftedBy?: string | null;
  readonly liftReason?: string | null;
}

export type CustomerAccountLinkType =
  | 'VERIFIED_PHONE'
  | 'VERIFIED_EMAIL'
  | 'MANUAL_CLAIM'
  | 'INVITATION'
  | 'GUEST_CONVERSION';

export type CustomerAccountStatus = 'ACTIVE' | 'UNLINKED' | 'SUSPENDED';

export interface CustomerAccount {
  readonly id: string;
  readonly customerId: string;
  readonly userId: string;
  readonly linkType: CustomerAccountLinkType;
  readonly verifiedAt: string;
  readonly status: CustomerAccountStatus;
  readonly createdAt: string;
  readonly unlinkedAt?: string | null;
  readonly unlinkedBy?: string | null;
  readonly unlinkReason?: string | null;
  readonly user?: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  } | null;
}

export interface CustomerCommunicationSummary {
  readonly id: string;
  readonly channel: 'IN_APP' | 'EMAIL' | 'SMS';
  readonly notificationType: string;
  readonly renderedSubject: string | null;
  readonly renderedBody: string;
  readonly intendedRecipient: string | null;
  readonly effectiveRecipient: string | null;
  readonly status: string;
  readonly provider: string | null;
  readonly providerMessageId: string | null;
  readonly skipReason: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly sourceDomain: string;
  readonly sourceId: string;
  readonly sentAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly smsDetails?: {
    readonly originalRecipient: string | null;
    readonly normalizedRecipient: string | null;
    readonly encoding: string;
    readonly characterCount: number;
    readonly estimatedSegments: number;
    readonly senderType: string;
    readonly senderId: string | null;
  } | null;
}

export type CustomerTimelineEventType =
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_COMPLETED'
  | 'REFUND_COMPLETED'
  | 'RESTRICTION_APPLIED'
  | 'RESTRICTION_LIFTED'
  | 'NOTE_ADDED'
  | 'TAG_ASSIGNED'
  | 'ACCOUNT_LINKED'
  | 'ACCOUNT_UNLINKED'
  | 'CUSTOMER_MERGED'
  | 'COMMUNICATION_SENT';

export interface CustomerTimelineEvent {
  readonly id: string;
  readonly eventType: CustomerTimelineEventType;
  readonly title: string;
  readonly description?: string | null;
  readonly occurredAt: string;
  readonly actorType?: string | null;
  readonly actorId?: string | null;
  readonly referenceType?: string | null;
  readonly referenceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface CustomerMergePreview {
  readonly sourceCustomer: CustomerSummary;
  readonly targetCustomer: CustomerSummary;
  readonly canMerge: boolean;
  readonly blockingConflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: {
    readonly ordersToMove: number;
    readonly phonesToCombine: number;
    readonly duplicatePhones: number;
    readonly emailsToCombine: number;
    readonly duplicateEmails: number;
    readonly addressesToMove: number;
    readonly notesToMove: number;
    readonly tagsToMerge: number;
    readonly restrictionsToTransfer: number;
    readonly sourceHasAccount: boolean;
    readonly targetHasAccount: boolean;
  };
}
