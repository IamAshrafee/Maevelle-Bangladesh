import { fetchApiData, ApiRequestError } from '@/lib/api';
export { ApiRequestError };
export type PaymentOwner = { organizationId: string; actorId: string };
export interface PaymentIntent {
  readonly path: string;
  readonly body: string;
  readonly key: string;
  readonly owner: string;
}
export const paymentOwnerKey = (owner: PaymentOwner) => `${owner.organizationId}:${owner.actorId}`;
export function paymentIntent(path: string, body: unknown, owner: PaymentOwner): PaymentIntent {
  const key = crypto.randomUUID();
  const request = path.startsWith('/admin/finance/')
    ? { ...(body as Record<string, unknown>), idempotencyKey: key }
    : body;
  return Object.freeze({ path, body: JSON.stringify(request), key, owner: paymentOwnerKey(owner) });
}
export function sendPaymentIntent<T>(intent: PaymentIntent, owner: PaymentOwner) {
  if (intent.owner !== paymentOwnerKey(owner))
    throw new Error('Payment context changed. Reload the authorized record.');
  return fetchApiData<T>(intent.path, {
    method: 'POST',
    headers: { 'idempotency-key': intent.key, 'x-organization-id': owner.organizationId },
    body: intent.body,
  });
}
export function paymentError(error: unknown): string {
  if (
    error instanceof ApiRequestError &&
    (error.status >= 500 || error.code === 'INVALID_RESPONSE')
  )
    return 'The result is uncertain. Retry the exact request or reload the authorized record before another action.';
  if (error instanceof ApiRequestError) {
    const messages: Record<string, string> = {
      FORBIDDEN: 'Your permission changed or this action is not permitted. Reload your access.',
      DUPLICATE_EXTERNAL_TRANSACTION:
        'This transfer already has financial history. Reconcile the existing receipt; do not verify it again.',
      CONFLICT: 'The record changed or this transition is unavailable. Refresh before acting.',
      IDEMPOTENCY_CONFLICT:
        'These details differ from an existing submission. Reconcile the original operation.',
      POLICY_BLOCKED:
        'This action is blocked by financial or provider policy. Review readiness and the record.',
      NOT_FOUND: 'This record is unavailable in the current organization.',
    };
    return (
      messages[error.code] ??
      'The server rejected this operation. Check the details and refresh the record.'
    );
  }
  return 'The result is uncertain. Keep this dialog open and retry the exact same request, or reconcile the authorized record after reload.';
}
export const uncertainPaymentResult = (error: unknown) =>
  !(error instanceof ApiRequestError) || error.status >= 500 || error.code === 'INVALID_RESPONSE';
/** Display every stored decimal digit; no float conversion, rounding or payable calculation. */
export function paymentMoney(value: string, currency = 'BDT'): string {
  if (!/^-?\d{1,16}(?:\.\d{1,4})?$/.test(value)) return 'Amount unavailable';
  const [whole, fraction = ''] = value.split('.');
  return `${currency} ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
export const paymentLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (c) => c.toUpperCase());
