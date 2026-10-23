import type {
  InstagramConnectionView,
  InstagramIntegrationAvailability,
  InstagramOAuthStatusView,
  InstagramReplyEligibility,
  InstagramSyncView,
} from '@maevelle/contracts/messaging';

import { apiRequest, fetchApiData } from '@/lib/api';

const base = '/admin/messaging/connections/instagram';

function signalInit(signal?: AbortSignal): RequestInit {
  return signal ? { signal } : {};
}

export const getInstagramAvailability = (signal?: AbortSignal) =>
  fetchApiData<InstagramIntegrationAvailability>(`${base}/availability`, signalInit(signal));

export const startInstagramOAuth = () =>
  fetchApiData<{ authorizationUrl: string; attemptId: string; expiresAt: string }>(
    `${base}/oauth`,
    { method: 'POST' },
  );

export const getInstagramOAuthStatus = (attemptId: string, signal?: AbortSignal) =>
  fetchApiData<InstagramOAuthStatusView>(`${base}/oauth/${attemptId}`, signalInit(signal));

export const connectInstagramAccount = (input: { attemptId: string; instagramAccountId: string }) =>
  fetchApiData<InstagramConnectionView>(base, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const listInstagramConnections = (signal?: AbortSignal) =>
  fetchApiData<readonly InstagramConnectionView[]>(base, signalInit(signal));

export const getInstagramConnection = (connectionId: string, signal?: AbortSignal) =>
  fetchApiData<InstagramConnectionView>(`${base}/${connectionId}`, signalInit(signal));

export const updateInstagramConnection = (
  connectionId: string,
  version: string,
  input: {
    suspended?: boolean;
    permissionReviewStatus?: InstagramConnectionView['permissionReviewStatus'];
  },
) =>
  fetchApiData<InstagramConnectionView>(`${base}/${connectionId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

export const triggerInstagramDiagnostics = (connectionId: string) =>
  fetchApiData<InstagramConnectionView>(`${base}/${connectionId}/diagnostics`, {
    method: 'POST',
  });

export const disconnectInstagramConnection = (connectionId: string) =>
  apiRequest<void>(`${base}/${connectionId}`, { method: 'DELETE' });

export const getInstagramReplyEligibility = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<InstagramReplyEligibility>(
    `/admin/messaging/conversations/${conversationId}/instagram-reply-eligibility`,
    signalInit(signal),
  );

export const createInstagramSyncJob = (connectionId: string) =>
  fetchApiData<InstagramSyncView>(`${base}/${connectionId}/syncs`, { method: 'POST' });

export const getInstagramSyncJob = (syncId: string, signal?: AbortSignal) =>
  fetchApiData<InstagramSyncView>(`${base}/syncs/${syncId}`, signalInit(signal));
