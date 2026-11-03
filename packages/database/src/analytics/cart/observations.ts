import {
  cartInteractionNames,
  cartObservationCommands,
  cartObservationSurfaces,
  cartRejectionReasons,
  type CartObservationDto,
  type CartInteractionName,
} from '@maevelle/contracts';

export class CartObservationError extends Error {
  readonly code = 'INVALID_ANALYTICS_EVENT';
}

export function isCartObservationName(value: unknown): value is CartInteractionName {
  return cartInteractionNames.some((name) => name === value);
}

function hasKeys(value: unknown, ...keys: string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)),
  );
}

function timestamp(value: unknown, earliest: number, latest: number) {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return parsed >= earliest && parsed <= latest;
}

/** Validate before HTTP coercion and again at ingestion, including callers outside HTTP. */
export function validateCartObservation(value: unknown): asserts value is CartObservationDto {
  const invalid = () => new CartObservationError('Invalid Cart observation.');
  const now = Date.now();
  if (
    !hasKeys(
      value,
      'schemaVersion',
      'name',
      'origin',
      'eventId',
      'occurredAt',
      'consent',
      'data',
    ) ||
    value.schemaVersion !== 1 ||
    value.origin !== 'BROWSER' ||
    !isCartObservationName(value.name) ||
    typeof value.eventId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.eventId) ||
    !timestamp(value.occurredAt, now - 86_400_000, now + 300_000)
  )
    throw invalid();

  const { name, consent, data } = value;
  if (
    !hasKeys(consent, 'necessary', 'analytics', 'marketing', 'preferences', 'recordedAt') ||
    consent.necessary !== 'GRANTED' ||
    consent.marketing !== 'DENIED' ||
    consent.preferences !== 'DENIED' ||
    (consent.analytics !== 'GRANTED' &&
      consent.analytics !== 'DENIED' &&
      consent.analytics !== 'UNKNOWN') ||
    !timestamp(consent.recordedAt, 0, now + 300_000)
  )
    throw invalid();

  const valid = (() => {
    switch (name) {
      case 'CART_VIEWED':
        return (
          hasKeys(data, 'mode', 'surface') &&
          cartObservationSurfaces.some((surface) => surface === data.surface) &&
          (data.surface !== 'MERGE_REVIEW' || data.mode === 'ACCOUNT')
        );
      case 'CART_COMMAND_INITIATED':
        return (
          hasKeys(data, 'mode', 'command') &&
          cartObservationCommands.some((command) => command === data.command)
        );
      case 'CART_COMMAND_REJECTED':
        return (
          hasKeys(data, 'mode', 'command', 'reason') &&
          cartObservationCommands.some((command) => command === data.command) &&
          cartRejectionReasons.some((reason) => reason === data.reason)
        );
      case 'CART_RECOVERY_VIEWED':
        return hasKeys(data, 'mode');
    }
  })();
  if (
    !valid ||
    !data ||
    typeof data !== 'object' ||
    !('mode' in data) ||
    (data.mode !== 'GUEST' && data.mode !== 'ACCOUNT') ||
    (data.mode === 'GUEST' &&
      'command' in data &&
      (data.command === 'WISHLIST_MOVE' || data.command === 'MERGE_CONFIRM'))
  )
    throw invalid();
}
