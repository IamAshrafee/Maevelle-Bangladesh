import type { CartCommand, CartIntent } from './types';
const KEY = 'maevelle_cart_pending_v1';
const SESSION_REVIEW_KEY = 'maevelle_cart_session_review_v1';
const CONTEXT_KEY = 'maevelle_cart_context_v1';
const MAX_AGE = 7 * 86_400_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface CartJournal {
  requiresSessionReview(): boolean;
  markSessionForgotten(required: boolean): boolean;
  read(): CartIntent | null;
  save(intent: CartIntent | null): boolean;
  context(): string | undefined;
  select(context?: string): void;
}
export function createCartJournal(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
  now = Date.now,
): CartJournal {
  return {
    requiresSessionReview() {
      try {
        return storage.getItem(SESSION_REVIEW_KEY) === 'required';
      } catch {
        return false;
      }
    },
    markSessionForgotten(required) {
      try {
        if (required) storage.setItem(SESSION_REVIEW_KEY, 'required');
        else storage.removeItem(SESSION_REVIEW_KEY);
        return true;
      } catch {
        return false;
      }
    },
    read() {
      try {
        const raw = storage.getItem(KEY);
        if (!raw || raw.length > 2048) return null;
        const parsed = JSON.parse(raw) as Partial<CartIntent>;
        if (
          !parsed.key ||
          !uuid.test(parsed.key) ||
          !parsed.ownerContext ||
          !uuid.test(parsed.ownerContext) ||
          !Number.isSafeInteger(parsed.version) ||
          parsed.version! < 1 ||
          typeof parsed.createdAt !== 'number' ||
          parsed.createdAt > now() + 60_000 ||
          now() - parsed.createdAt > MAX_AGE
        )
          return null;
        const command = parsed.command as CartCommand | undefined;
        if (!command) return null;
        if (
          command.kind === 'add' &&
          uuid.test(command.variantId) &&
          /^[1-9][0-9]?$/.test(command.quantity)
        )
          return {
            key: parsed.key,
            ownerContext: parsed.ownerContext,
            version: parsed.version!,
            createdAt: parsed.createdAt,
            command: {
              kind: command.kind,
              variantId: command.variantId,
              quantity: command.quantity,
            },
          };
        if (
          command.kind === 'set' &&
          uuid.test(command.lineId) &&
          /^[1-9][0-9]?$/.test(command.quantity)
        )
          return {
            key: parsed.key,
            ownerContext: parsed.ownerContext,
            version: parsed.version!,
            createdAt: parsed.createdAt,
            command: { kind: command.kind, lineId: command.lineId, quantity: command.quantity },
          };
        if (command.kind === 'clear')
          return {
            key: parsed.key,
            ownerContext: parsed.ownerContext,
            version: parsed.version!,
            createdAt: parsed.createdAt,
            command: { kind: 'clear' },
          };
        if (command.kind === 'remove' && uuid.test(command.lineId))
          return {
            key: parsed.key,
            ownerContext: parsed.ownerContext,
            version: parsed.version!,
            createdAt: parsed.createdAt,
            command: { kind: command.kind, lineId: command.lineId },
          };
      } catch {
        /* Storage/corrupt artifacts never grant authority. */
      }
      return null;
    },
    save(intent) {
      try {
        // Coupon text and full Cart/customer/product projections are never persisted.
        if (!intent) {
          storage.removeItem(KEY);
          return true;
        }
        if (intent.command.kind === 'apply-coupon' || intent.command.kind === 'remove-coupon')
          return false;
        storage.setItem(KEY, JSON.stringify(intent));
        return true;
      } catch {
        return false;
      }
    },
    context() {
      try {
        const value = storage.getItem(CONTEXT_KEY);
        return value && uuid.test(value) ? value : undefined;
      } catch {
        return undefined;
      }
    },
    select(context) {
      try {
        if (context) storage.setItem(CONTEXT_KEY, context);
        else storage.removeItem(CONTEXT_KEY);
      } catch {
        /* Memory selection still works. */
      }
    },
  };
}
