import type { CustomerSummaryDto, PaginatedEnvelope } from '@maevelle/contracts';
import type {
  AgentAvailabilityView,
  BusinessHoursView,
  ConversationActivityView,
  ConversationDetail,
  ConversationPriority,
  ConversationStatus,
  ConversationSummary,
  CursorPage,
  FollowUpView,
  InboxCounts,
  InternalNoteView,
  MessageView,
  MessagingReportSummary,
  MessagingTag,
  SavedReplyView,
} from '@maevelle/contracts/messaging';

import { apiRequest, fetchApiData } from '@/lib/api';
import type {
  AssignmentHistoryView,
  AssignmentRuleView,
  ChannelSettingsView,
  InboxFilters,
  MessagingCustomerContextView,
  NotificationPreferenceView,
  StaffAttachmentUploadView,
} from './types';

const base = '/admin/messaging';

function signalInit(signal?: AbortSignal): RequestInit {
  return signal ? { signal } : {};
}

function queryString(values: Readonly<Record<string, string | number | boolean | undefined>>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

export function listConversations(filters: InboxFilters, cursor?: string, signal?: AbortSignal) {
  const query = queryString({ ...filters, cursor, limit: 30 });
  return apiRequest<CursorPage<ConversationSummary>>(
    `${base}/conversations?${query}`,
    signalInit(signal),
  );
}

export const getInboxCounts = (signal?: AbortSignal) =>
  fetchApiData<InboxCounts>(`${base}/inbox/counts`, signalInit(signal));

export const getConversation = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<ConversationDetail>(`${base}/conversations/${conversationId}`, signalInit(signal));

export const listMessages = (conversationId: string, before?: string, signal?: AbortSignal) =>
  apiRequest<CursorPage<MessageView>>(
    `${base}/conversations/${conversationId}/messages?${queryString({ before, limit: 50 })}`,
    signalInit(signal),
  );

export const markRead = (conversationId: string, sequence: string) =>
  apiRequest<void>(`${base}/conversations/${conversationId}/read`, {
    method: 'POST',
    body: JSON.stringify({ lastReadSequence: sequence }),
  });

export const sendMessage = (
  conversationId: string,
  input: {
    clientMessageId: string;
    idempotencyKey: string;
    text?: string;
    attachmentIds?: readonly string[];
  },
) =>
  fetchApiData<MessageView>(`${base}/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey },
    body: JSON.stringify({
      clientMessageId: input.clientMessageId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
    }),
  });

export const claimConversation = (conversationId: string) =>
  fetchApiData<ConversationDetail>(`${base}/conversations/${conversationId}/claim`, {
    method: 'POST',
  });

export const assignConversation = (
  conversationId: string,
  version: string,
  assigneeMembershipId: string | null,
  reason?: string,
) =>
  fetchApiData<ConversationDetail>(`${base}/conversations/${conversationId}/assignment`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify({ assigneeMembershipId, ...(reason ? { reason } : {}) }),
  });

export const updateConversationStatus = (
  conversationId: string,
  version: string,
  status: ConversationStatus,
  reason?: string,
) =>
  fetchApiData<ConversationDetail>(`${base}/conversations/${conversationId}/status`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
  });

export const updateConversationPriority = (
  conversationId: string,
  version: string,
  priority: ConversationPriority,
  isStarred?: boolean,
) =>
  fetchApiData<ConversationDetail>(`${base}/conversations/${conversationId}/priority`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify({ priority, ...(isStarred === undefined ? {} : { isStarred }) }),
  });

export const listEligibleAgents = (signal?: AbortSignal) =>
  fetchApiData<readonly AgentAvailabilityView[]>(`${base}/agents/eligible`, signalInit(signal));

export const getOwnAvailability = (signal?: AbortSignal) =>
  fetchApiData<AgentAvailabilityView | null>(`${base}/availability/me`, signalInit(signal));

export const setOwnAvailability = (status: AgentAvailabilityView['status'], capacity: number) =>
  fetchApiData<AgentAvailabilityView>(`${base}/availability/me`, {
    method: 'PATCH',
    body: JSON.stringify({ status, capacity }),
  });

export const heartbeatAvailability = () =>
  apiRequest<void>(`${base}/availability/me/heartbeat`, { method: 'POST' });

export const listAssignmentHistory = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<readonly AssignmentHistoryView[]>(
    `${base}/conversations/${conversationId}/assignment-history`,
    signalInit(signal),
  );

export const listNotes = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<readonly InternalNoteView[]>(
    `${base}/conversations/${conversationId}/notes`,
    signalInit(signal),
  );

export const createNote = (conversationId: string, body: string) =>
  fetchApiData<InternalNoteView>(`${base}/conversations/${conversationId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export const updateNote = (noteId: string, revision: number, body: string) =>
  fetchApiData<InternalNoteView>(`${base}/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${revision}"` },
    body: JSON.stringify({ body, revision }),
  });

export const deleteNote = (noteId: string, reason: string) =>
  apiRequest<void>(`${base}/notes/${noteId}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });

export const listTags = (includeArchived = false, signal?: AbortSignal) =>
  fetchApiData<readonly MessagingTag[]>(
    `${base}/tags?${queryString({ includeArchived })}`,
    signalInit(signal),
  );

export const createTag = (label: string, colorToken?: string) =>
  fetchApiData<MessagingTag>(`${base}/tags`, {
    method: 'POST',
    body: JSON.stringify({ label, ...(colorToken ? { colorToken } : {}) }),
  });

export const updateTag = (
  tagId: string,
  version: string,
  input: { label?: string; colorToken?: string | null; status?: 'ACTIVE' | 'ARCHIVED' },
) =>
  fetchApiData<MessagingTag>(`${base}/tags/${tagId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

export const setConversationTag = (conversationId: string, tagId: string, assigned: boolean) =>
  apiRequest<void>(`${base}/conversations/${conversationId}/tags/${tagId}`, {
    method: assigned ? 'POST' : 'DELETE',
  });

export const listSavedReplies = (query?: string, includeArchived = false, signal?: AbortSignal) =>
  fetchApiData<readonly SavedReplyView[]>(
    `${base}/saved-replies?${queryString({ query, includeArchived, limit: 100 })}`,
    signalInit(signal),
  );

export const createSavedReply = (input: {
  title: string;
  body: string;
  shortcut?: string;
  category?: string;
}) =>
  fetchApiData<SavedReplyView>(`${base}/saved-replies`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateSavedReply = (
  savedReplyId: string,
  version: string,
  input: {
    title?: string;
    body?: string;
    shortcut?: string | null;
    category?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
  },
) =>
  fetchApiData<SavedReplyView>(`${base}/saved-replies/${savedReplyId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

export const listFollowUps = (
  input: {
    conversationId?: string;
    status?: FollowUpView['status'];
    mine?: boolean;
    limit?: number;
  },
  signal?: AbortSignal,
) =>
  fetchApiData<readonly FollowUpView[]>(
    `${base}/follow-ups?${queryString(input)}`,
    signalInit(signal),
  );

export const createFollowUp = (
  conversationId: string,
  input: { responsibleMembershipId: string; dueAt: string; note?: string },
) =>
  fetchApiData<FollowUpView>(`${base}/conversations/${conversationId}/follow-ups`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateFollowUp = (
  followUpId: string,
  version: string,
  input: { responsibleMembershipId: string; dueAt: string; note?: string | null },
) =>
  fetchApiData<FollowUpView>(`${base}/follow-ups/${followUpId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

export const transitionFollowUp = (
  followUpId: string,
  version: string,
  status: 'COMPLETED' | 'CANCELLED',
) =>
  fetchApiData<FollowUpView>(`${base}/follow-ups/${followUpId}/status`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify({ status }),
  });

export const listTimeline = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<readonly ConversationActivityView[]>(
    `${base}/conversations/${conversationId}/timeline?limit=200`,
    signalInit(signal),
  );

export const getCustomerContext = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<MessagingCustomerContextView>(
    `${base}/conversations/${conversationId}/customer-context`,
    signalInit(signal),
  );

export const searchCustomers = (query: string, signal?: AbortSignal) =>
  fetchApiData<PaginatedEnvelope<CustomerSummaryDto>>(
    `/admin/customers?${queryString({ q: query, page: 1, pageSize: 20 })}`,
    signalInit(signal),
  );

export const linkCustomer = (
  contactId: string,
  input: {
    customerId: string;
    method: 'VERIFIED_EMAIL' | 'VERIFIED_PHONE' | 'STAFF_REVIEW';
    evidenceReference?: string;
    reason: string;
  },
) =>
  fetchApiData<{ contactId: string; customerId: string; linkStatus: 'LINKED' }>(
    `${base}/contacts/${contactId}/customer-link`,
    { method: 'POST', body: JSON.stringify(input) },
  );

export const unlinkCustomer = (contactId: string, reason: string) =>
  fetchApiData<{ contactId: string; customerId: null; linkStatus: string }>(
    `${base}/contacts/${contactId}/customer-link`,
    { method: 'DELETE', body: JSON.stringify({ reason }) },
  );

export const getBusinessHours = (connectionId?: string, signal?: AbortSignal) =>
  fetchApiData<BusinessHoursView>(
    `${base}/settings/business-hours?${queryString({ connectionId })}`,
    signalInit(signal),
  );

export const updateBusinessHours = (value: BusinessHoursView) =>
  fetchApiData<BusinessHoursView>(`${base}/settings/business-hours`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${value.version}"` },
    body: JSON.stringify({
      connectionId: value.connectionId,
      timezone: value.timezone,
      weeklySchedule: value.weeklySchedule,
      offlineAcceptsMessages: value.offlineAcceptsMessages,
      manualClosureUntil: value.manualClosureUntil,
      exceptions: value.exceptions.map(({ localDate, intervals, isClosed, label }) => ({
        localDate,
        intervals,
        isClosed,
        label,
      })),
    }),
  });

export const listChannelSettings = (signal?: AbortSignal) =>
  fetchApiData<readonly ChannelSettingsView[]>(`${base}/settings/channels`, signalInit(signal));

export const updateChannelSettings = (value: ChannelSettingsView) =>
  fetchApiData<ChannelSettingsView>(`${base}/settings/channel/${value.id}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${value.version}"` },
    body: JSON.stringify({
      enabled: value.enabled,
      acceptsOfflineMessages: value.acceptsOfflineMessages,
      greeting: value.greeting,
      offlineMessage: value.offlineMessage,
    }),
  });

export const listAssignmentRules = (signal?: AbortSignal) =>
  fetchApiData<readonly AssignmentRuleView[]>(
    `${base}/settings/assignment-rules`,
    signalInit(signal),
  );

export const createAssignmentRule = (input: {
  name: string;
  position: number;
  isEnabled: boolean;
  conditions: Readonly<Record<string, unknown>>;
  actions: Readonly<Record<string, unknown>>;
}) =>
  fetchApiData<{ id: string; version: string }>(`${base}/settings/assignment-rules`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateAssignmentRule = (rule: AssignmentRuleView) =>
  fetchApiData<{ id: string; version: string }>(`${base}/settings/assignment-rules/${rule.id}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${rule.version}"` },
    body: JSON.stringify({
      name: rule.name,
      position: rule.position,
      isEnabled: rule.isEnabled,
      conditions: rule.conditions,
      actions: rule.actions,
    }),
  });

export const getReport = (
  input: { from: string; to: string; channelKind?: string; assigneeMembershipId?: string },
  signal?: AbortSignal,
) =>
  fetchApiData<MessagingReportSummary>(
    `${base}/reports/summary?${queryString(input)}`,
    signalInit(signal),
  );

export const listNotificationPreferences = (signal?: AbortSignal) =>
  fetchApiData<readonly NotificationPreferenceView[]>(
    `${base}/notification-preferences`,
    signalInit(signal),
  );

export const updateNotificationPreference = (notificationType: string, enabled: boolean) =>
  apiRequest<void>(`${base}/notification-preferences`, {
    method: 'PATCH',
    body: JSON.stringify({ notificationType, enabled }),
  });

export const bulkUpdateConversations = (
  items: readonly { conversationId: string; version: string }[],
  action: Readonly<Record<string, unknown>>,
) =>
  fetchApiData<readonly { conversationId: string; ok: boolean; code?: string; version?: string }[]>(
    `${base}/conversations/bulk`,
    { method: 'POST', body: JSON.stringify({ items, action }) },
  );

export async function uploadStaffAttachment(
  conversationId: string,
  file: File,
  onProgress?: (state: StaffAttachmentUploadView['status']) => void,
): Promise<string> {
  onProgress?.('PENDING_UPLOAD');
  const authorization = await fetchApiData<StaffAttachmentUploadView>(
    `${base}/conversations/${conversationId}/uploads`,
    {
      method: 'POST',
      body: JSON.stringify({ fileName: file.name, mimeType: file.type, byteSize: file.size }),
    },
  );
  if (!authorization.upload) throw new Error('Upload authorization was not returned.');
  const response = await fetch(authorization.upload.url, {
    method: authorization.upload.method ?? 'PUT',
    ...(authorization.upload.headers ? { headers: authorization.upload.headers } : {}),
    body: file,
    credentials: authorization.upload.strategy === 'API_PROXY' ? 'include' : 'omit',
  });
  if (!response.ok) throw new Error('The attachment could not be uploaded.');
  onProgress?.('UPLOADED');
  await fetchApiData<StaffAttachmentUploadView>(
    `${base}/conversations/${conversationId}/uploads/${authorization.sessionId}/complete`,
    { method: 'POST' },
  );
  onProgress?.('PROCESSING');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await fetchApiData<StaffAttachmentUploadView>(
      `${base}/conversations/${conversationId}/uploads/${authorization.assetId}`,
    );
    onProgress?.(status.status);
    if (status.status === 'AVAILABLE') return authorization.assetId;
    if (status.status === 'REJECTED')
      throw new Error(status.errorMessage ?? 'The attachment was rejected.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Attachment processing is taking longer than expected. Try again shortly.');
}

export * from './facebook/facebook-api';
