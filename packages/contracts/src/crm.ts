export type CustomerLifecycleStageDto =
  | 'NEW_CONTACT'
  | 'PROSPECT'
  | 'ENGAGED_PROSPECT'
  | 'FIRST_TIME_BUYER'
  | 'REPEAT_CUSTOMER'
  | 'LOYAL_CUSTOMER'
  | 'INACTIVE_CUSTOMER'
  | 'RE_ENGAGED_CUSTOMER';

export type CustomerRelationshipStatusDto =
  'UNASSIGNED' | 'ACTIVE' | 'FOLLOW_UP' | 'AT_RISK' | 'DORMANT';

export interface CustomerCrmProfileDto {
  readonly customerId: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly preferredLanguage: string | null;
  readonly lifecycleStage: CustomerLifecycleStageDto;
  readonly relationshipOwnerMembershipId: string | null;
  readonly relationshipOwnerName: string | null;
  readonly relationshipStatus: CustomerRelationshipStatusDto;
  readonly profileImageAssetId: string | null;
  readonly lastActivityAt: string | null;
  readonly firstPurchaseAt: string | null;
  readonly lastPurchaseAt: string | null;
  readonly profileProvenance: Readonly<Record<string, unknown>>;
  readonly completeness: {
    readonly percentage: number;
    readonly missing: readonly string[];
    readonly unverified: readonly string[];
  };
  readonly preferences: readonly CustomerPreferenceDto[];
  readonly customFields: readonly CustomerCustomFieldValueDto[];
  readonly followUps: readonly CustomerFollowUpDto[];
  readonly consents: readonly CustomerConsentDto[];
}

export interface CustomerPreferenceDto {
  readonly id: string;
  readonly key: string;
  readonly value: unknown;
  readonly source: 'CUSTOMER_CONFIRMED' | 'AGENT_RECORDED' | 'COMMERCE_OBSERVED' | 'IMPORTED';
  readonly confidence: 'INFERRED' | 'REPORTED' | 'CONFIRMED';
  readonly evidenceReference: string | null;
  readonly updatedAt: string;
  readonly version: number;
}

export type CustomerIdentityLinkStatusDto =
  'CANDIDATE' | 'LINKED' | 'REJECTED' | 'REVOKED' | 'DISPUTED';
export type CustomerIdentityAssuranceDto = 'UNVERIFIED' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface CustomerIdentityLinkDto {
  readonly id: string;
  readonly customerId: string;
  readonly contactId: string;
  readonly contactIdentityId: string;
  readonly provider: 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';
  readonly channelConnectionId: string;
  readonly externalSubjectId: string;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly status: CustomerIdentityLinkStatusDto;
  readonly assurance: CustomerIdentityAssuranceDto;
  readonly evidenceMethod: string;
  readonly evidenceReference: string | null;
  readonly evidenceSummary: string;
  readonly linkedAt: string | null;
  readonly revokedAt: string | null;
  readonly revocationReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CustomerIdentityEventDto {
  readonly id: string;
  readonly action: string;
  readonly previousStatus: string | null;
  readonly newStatus: string;
  readonly assurance: CustomerIdentityAssuranceDto;
  readonly evidenceMethod: string;
  readonly evidenceReference: string | null;
  readonly reason: string;
  readonly actorType: string;
  readonly actorId: string | null;
  readonly createdAt: string;
}

export interface CustomerFollowUpDto {
  readonly id: string;
  readonly customerId: string;
  readonly assignedMembershipId: string;
  readonly assigneeName: string | null;
  readonly title: string;
  readonly details: string | null;
  readonly dueAt: string;
  readonly status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  readonly completedAt: string | null;
  readonly version: number;
}

export type CustomerSegmentRuleDto = {
  readonly all?: readonly CustomerSegmentConditionDto[];
  readonly any?: readonly CustomerSegmentConditionDto[];
};

export type CustomerSegmentConditionDto =
  | {
      readonly field: 'lifecycleStage';
      readonly operator: 'EQ' | 'IN';
      readonly value: string | readonly string[];
    }
  | {
      readonly field: 'status';
      readonly operator: 'EQ' | 'IN';
      readonly value: string | readonly string[];
    }
  | {
      readonly field: 'completedOrderCount';
      readonly operator: 'GTE' | 'LTE' | 'EQ';
      readonly value: number;
    }
  | { readonly field: 'netPurchaseValue'; readonly operator: 'GTE' | 'LTE'; readonly value: number }
  | {
      readonly field: 'lastPurchaseDaysAgo';
      readonly operator: 'GTE' | 'LTE';
      readonly value: number;
    }
  | { readonly field: 'tagId'; readonly operator: 'EQ'; readonly value: string }
  | { readonly field: 'hasVerifiedIdentity'; readonly operator: 'EQ'; readonly value: boolean };

export interface CustomerSegmentDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly segmentType: 'STATIC' | 'DYNAMIC';
  readonly ruleDefinition: CustomerSegmentRuleDto;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly memberCount: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CustomerCustomFieldDefinitionDto {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly description: string | null;
  readonly valueType: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'SINGLE_CHOICE' | 'MULTI_CHOICE';
  readonly choices: readonly string[];
  readonly validation: Readonly<Record<string, unknown>>;
  readonly isRequired: boolean;
  readonly isSearchable: boolean;
  readonly editCapability: string;
  readonly schemaVersion: number;
  readonly status: 'ACTIVE' | 'ARCHIVED';
}

export interface CustomerCustomFieldValueDto {
  readonly definition: CustomerCustomFieldDefinitionDto;
  readonly value: unknown;
  readonly schemaVersion: number;
  readonly updatedAt: string;
}

export interface CustomerConsentDto {
  readonly id: string;
  readonly purpose: string;
  readonly channel: 'EMAIL' | 'SMS' | 'PHONE' | 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM' | 'ANY';
  readonly status: 'GRANTED' | 'DENIED' | 'WITHDRAWN' | 'SUPPRESSED';
  readonly lawfulBasis: string | null;
  readonly source: string;
  readonly evidenceReference: string | null;
  readonly effectiveAt: string;
}

export interface CrmAnalyticsDto {
  readonly totalCustomers: number;
  readonly verifiedCustomers: number;
  readonly unlinkedChannelContacts: number;
  readonly openDuplicateCandidates: number;
  readonly openFollowUps: number;
  readonly overdueFollowUps: number;
  readonly identityCoveragePercent: number;
  readonly commerce: {
    readonly firstTimeBuyers: number;
    readonly repeatBuyers: number;
    readonly repeatBuyerRatePercent: number;
    readonly completedOrderCount: number;
    readonly completedRevenueBdt: string;
    readonly completedRefundsBdt: string;
    readonly netCompletedRevenueBdt: string;
    readonly averageOrderValueBdt: string;
    readonly averageCompletedOrdersPerBuyer: number;
  };
  readonly acquisitionCohorts: readonly {
    readonly month: string;
    readonly newCustomers: number;
    readonly customersWithCompletedOrders: number;
    readonly repeatBuyers: number;
  }[];
  readonly lifecycleDistribution: readonly {
    readonly stage: CustomerLifecycleStageDto;
    readonly count: number;
  }[];
  readonly sourceDistribution: readonly { readonly source: string; readonly count: number }[];
  readonly dataQuality: {
    readonly missingContactCount: number;
    readonly unverifiedContactCount: number;
    readonly profilesWithoutOwnerCount: number;
  };
}
