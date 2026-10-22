import type {
  FacebookConnectionView,
  FacebookIntegrationAvailability,
  FacebookOAuthStartView,
  FacebookOAuthStatusView,
  FacebookReplyEligibility,
  FacebookSyncView,
} from '@maevelle/contracts/messaging';
import { apiRequest, fetchApiData } from '@/lib/api';

const base = '/admin/messaging/connections/facebook';

function signalInit(signal?: AbortSignal): RequestInit {
  return signal ? { signal } : {};
}

/**
 * Check if the backend is configured with Meta App credentials and webhook endpoints.
 */
export const getFacebookAvailability = (signal?: AbortSignal) =>
  fetchApiData<FacebookIntegrationAvailability>(`${base}/availability`, signalInit(signal));

/**
 * Start an organization-bound, single-use Meta OAuth attempt.
 * Returns the authorization URL to redirect to or open in a popup.
 */
export const startFacebookOAuth = (signal?: AbortSignal) =>
  fetchApiData<FacebookOAuthStartView>(`${base}/oauth`, {
    method: 'POST',
    ...signalInit(signal),
  });

/**
 * Poll or fetch the status of an OAuth attempt.
 * When status is 'AUTHORIZED', includes the list of eligible Facebook Pages discovered.
 */
export const getFacebookOAuthStatus = (attemptId: string, signal?: AbortSignal) =>
  fetchApiData<FacebookOAuthStatusView>(`${base}/oauth/${attemptId}`, signalInit(signal));

/**
 * Complete connection of an eligible Facebook Page using an authorized OAuth attempt.
 */
export const connectFacebookPage = (input: { attemptId: string; pageId: string }) =>
  fetchApiData<FacebookConnectionView>(base, {
    method: 'POST',
    body: JSON.stringify(input),
  });

/**
 * List all Facebook Page connections for the current active organization.
 */
export const listFacebookConnections = (signal?: AbortSignal) =>
  fetchApiData<readonly FacebookConnectionView[]>(base, signalInit(signal));

/**
 * Retrieve details, readiness metrics, and health diagnostics for a specific Page connection.
 */
export const getFacebookConnection = (connectionId: string, signal?: AbortSignal) =>
  fetchApiData<FacebookConnectionView>(`${base}/${connectionId}`, signalInit(signal));

/**
 * Suspend or resume messaging operations on a connected Facebook Page.
 * Uses optimistic concurrency via If-Match header.
 */
export const setFacebookConnectionSuspended = (
  connectionId: string,
  version: string,
  suspended: boolean,
) =>
  fetchApiData<FacebookConnectionView>(`${base}/${connectionId}`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify({ suspended }),
  });

/**
 * Trigger an on-demand live verification of Page access token and webhook subscription status.
 */
export const triggerFacebookDiagnostics = (connectionId: string) =>
  fetchApiData<FacebookConnectionView>(`${base}/${connectionId}/diagnostics`, {
    method: 'POST',
  });

/**
 * Update administrative assurance for App Review, Conversation Routing, or operational status.
 * Uses optimistic concurrency via If-Match header.
 */
export const updateFacebookAssurance = (
  connectionId: string,
  version: string,
  input: {
    permissionReviewStatus?: FacebookConnectionView['permissionReviewStatus'];
    routingStatus?: FacebookConnectionView['readiness']['routing'];
    operationalStatus?: FacebookConnectionView['readiness']['operational'];
  },
) =>
  fetchApiData<FacebookConnectionView>(`${base}/${connectionId}/assurance`, {
    method: 'PATCH',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

/**
 * Enable or disable Facebook Page webhook subscription with explicit coexistence reviews.
 * Requires Conversation Routing to be OWNER_CONFIRMED.
 * Uses optimistic concurrency via If-Match header.
 */
export const updateFacebookSubscription = (
  connectionId: string,
  version: string,
  input: {
    subscribed: boolean;
    businessSuiteCoexistenceReviewed: boolean;
    routingImpactReviewed: boolean;
  },
) =>
  fetchApiData<FacebookConnectionView>(`${base}/${connectionId}/subscription`, {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: JSON.stringify(input),
  });

/**
 * Safely disconnect a Facebook Page.
 * Unsubscribes from webhooks, securely purges local Page access tokens, and retains conversation history.
 */
export const disconnectFacebookConnection = (connectionId: string) =>
  apiRequest<void>(`${base}/${connectionId}`, {
    method: 'DELETE',
  });

/**
 * Preflight check for 24-hour Messenger reply policy window and capability restrictions.
 */
export const getFacebookReplyEligibility = (conversationId: string, signal?: AbortSignal) =>
  fetchApiData<FacebookReplyEligibility>(
    `/admin/messaging/conversations/${conversationId}/facebook-reply-eligibility`,
    signalInit(signal),
  );

/**
 * Request or resume a bounded historical conversation synchronization job.
 */
export const createFacebookSyncJob = (connectionId: string) =>
  fetchApiData<FacebookSyncView>(`${base}/${connectionId}/syncs`, {
    method: 'POST',
  });

/**
 * Poll or fetch the status, counters, and coverage of a historical synchronization job.
 */
export const getFacebookSyncJob = (syncId: string, signal?: AbortSignal) =>
  fetchApiData<FacebookSyncView>(`${base}/syncs/${syncId}`, signalInit(signal));
