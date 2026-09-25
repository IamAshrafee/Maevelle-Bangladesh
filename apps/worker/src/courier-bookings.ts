import type { CourierProviderPort } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import {
  completeCourierCancellationOperation,
  completeCourierBookingOperation,
  ingestCourierTrackingEvent,
  listCourierBookingsForTrackingReconciliation,
  listPendingCourierCancellationOperations,
  listPendingCourierBookingOperations,
  recordCourierReconciliationObservation,
  recoverStaleCourierBookingOperations,
} from '@maevelle/database/delivery';
import {
  getRtoCaseForDelivery,
  initiateRto,
  transitionReturnTransport,
} from '@maevelle/database/returns';

export type CourierProviderResolver = (input: {
  readonly integrationAccountId: string;
  readonly providerCode: string;
}) => Promise<CourierProviderPort | undefined>;

async function ingestTrackingEvidence(
  database: DatabaseClient,
  operation: Awaited<ReturnType<typeof listCourierBookingsForTrackingReconciliation>>[number],
  event: Awaited<ReturnType<NonNullable<CourierProviderPort['getBooking']>>>['events'][number],
  providerEventId: string,
  normalizedStatus = event.normalizedStatus,
): Promise<void> {
  await ingestCourierTrackingEvent(database.db, {
    organizationId: operation.organizationId,
    integrationAccountId: operation.integrationAccountId,
    courierBookingId: operation.bookingId,
    providerEventId,
    providerStatus: event.providerStatus,
    normalizedStatus,
    occurredAt: new Date(event.occurredAt),
    ...(event.reasonCode ? { reasonCode: event.reasonCode } : {}),
    ...(event.note ? { note: event.note } : {}),
    authenticationStatus: 'VERIFIED',
    rawPayload: {
      providerBookingId: operation.providerBookingId,
      providerStatus: event.providerStatus,
      occurredAt: event.occurredAt,
      ...(normalizedStatus !== event.normalizedStatus
        ? { derivedForReturnWorkflow: true, reportedNormalizedStatus: event.normalizedStatus }
        : {}),
    },
  });
}

async function reconcileReturnEvidence(
  database: DatabaseClient,
  operation: Awaited<ReturnType<typeof listCourierBookingsForTrackingReconciliation>>[number],
  event: Awaited<ReturnType<NonNullable<CourierProviderPort['getBooking']>>>['events'][number],
  providerEventId: string,
): Promise<void> {
  let rto = await getRtoCaseForDelivery(database.db, {
    organizationId: operation.organizationId,
    deliveryId: operation.deliveryId,
  });
  if (!rto) {
    // A current provider snapshot can legitimately skip outbound milestones.
    // Record the minimum evidence chain needed to establish failed delivery
    // before invoking the Returns-owned RTO state machine.
    await ingestTrackingEvidence(
      database,
      operation,
      event,
      `${providerEventId}:derived-in-transit`,
      'IN_TRANSIT',
    );
    await ingestTrackingEvidence(
      database,
      operation,
      event,
      `${providerEventId}:derived-failed`,
      'FAILED',
    );
    await initiateRto(database.db, {
      organizationId: operation.organizationId,
      actorId: operation.integrationAccountId,
      deliveryId: operation.deliveryId,
      idempotencyKey: `provider-rto:${operation.bookingId}:${providerEventId}`,
    });
    rto = await getRtoCaseForDelivery(database.db, {
      organizationId: operation.organizationId,
      deliveryId: operation.deliveryId,
    });
  }
  if (!rto) return;
  const nextStatus =
    event.normalizedStatus === 'RETURNED_TO_ORIGIN'
      ? 'ARRIVED'
      : event.normalizedStatus === 'RETURNING'
        ? 'IN_TRANSIT'
        : undefined;
  const transitionNeeded =
    nextStatus === 'ARRIVED'
      ? !['ARRIVED', 'LOST'].includes(rto.transportStatus)
      : nextStatus === 'IN_TRANSIT'
        ? ['NOT_STARTED', 'EXPECTED'].includes(rto.transportStatus)
        : false;
  if (nextStatus && transitionNeeded)
    await transitionReturnTransport(database.db, {
      organizationId: operation.organizationId,
      actorId: operation.integrationAccountId,
      returnCaseId: rto.id,
      expectedVersion: rto.version,
      nextStatus,
      idempotencyKey: `provider-rto-transport:${operation.bookingId}:${providerEventId}`,
    });
}

/**
 * Executes provider I/O outside domain transactions. The durable Integration
 * Operation is created first, so timeouts become an explicit unknown outcome
 * instead of an unsafe duplicate booking retry.
 */
export async function processCourierBookings(
  database: DatabaseClient,
  resolveProvider: CourierProviderResolver | undefined,
  limit = 10,
): Promise<number> {
  const recovered = await recoverStaleCourierBookingOperations(database.db);
  if (!resolveProvider) return recovered;
  const operations = await listPendingCourierBookingOperations(database.db, limit);
  let processed = 0;
  for (const operation of operations) {
    const provider = await resolveProvider({
      integrationAccountId: operation.integrationAccountId,
      providerCode: operation.providerCode,
    });
    if (!provider) continue;
    try {
      const result = await provider.createBooking(operation.request);
      await completeCourierBookingOperation(database.db, {
        organizationId: operation.organizationId,
        operationId: operation.operationId,
        bookingId: operation.bookingId,
        result,
      });
    } catch {
      await completeCourierBookingOperation(database.db, {
        organizationId: operation.organizationId,
        operationId: operation.operationId,
        bookingId: operation.bookingId,
        result: { kind: 'UNKNOWN_OUTCOME' },
      });
    }
    processed += 1;
  }
  const cancellations = await listPendingCourierCancellationOperations(database.db, limit);
  for (const operation of cancellations) {
    const provider = await resolveProvider({
      integrationAccountId: operation.integrationAccountId,
      providerCode: operation.providerCode,
    });
    if (!provider) continue;
    try {
      const result = provider.cancelBooking
        ? await provider.cancelBooking(operation.providerBookingId)
        : { kind: 'REJECTED' as const, reasonCode: 'CAPABILITY_NOT_SUPPORTED' };
      await completeCourierCancellationOperation(database.db, {
        organizationId: operation.organizationId,
        operationId: operation.operationId,
        bookingId: operation.bookingId,
        result,
      });
    } catch {
      await completeCourierCancellationOperation(database.db, {
        organizationId: operation.organizationId,
        operationId: operation.operationId,
        bookingId: operation.bookingId,
        result: { kind: 'UNKNOWN_OUTCOME' },
      });
    }
    processed += 1;
  }
  const tracking = await listCourierBookingsForTrackingReconciliation(database.db, limit);
  for (const operation of tracking) {
    const provider = await resolveProvider({
      integrationAccountId: operation.integrationAccountId,
      providerCode: operation.providerCode,
    });
    if (!provider?.getBooking) continue;
    try {
      const result = await provider.getBooking(operation.providerBookingId);
      for (const event of result.events) {
        const providerEventId =
          event.providerEventId ??
          `${operation.providerBookingId}:${event.providerStatus}:${event.occurredAt}`;
        const existingRto = await getRtoCaseForDelivery(database.db, {
          organizationId: operation.organizationId,
          deliveryId: operation.deliveryId,
        });
        if (
          !existingRto &&
          ['OUT_FOR_DELIVERY', 'DELIVERED', 'ATTEMPT_FAILED', 'LOST', 'DAMAGED'].includes(
            event.normalizedStatus,
          )
        )
          await ingestTrackingEvidence(
            database,
            operation,
            event,
            `${providerEventId}:derived-in-transit`,
            'IN_TRANSIT',
          );
        if (['RTO_INITIATED', 'RETURNING', 'RETURNED_TO_ORIGIN'].includes(event.normalizedStatus))
          await reconcileReturnEvidence(database, operation, event, providerEventId);
        else if (event.normalizedStatus === 'LOST') {
          if (
            existingRto &&
            ['NOT_STARTED', 'EXPECTED', 'IN_TRANSIT'].includes(existingRto.transportStatus)
          )
            await transitionReturnTransport(database.db, {
              organizationId: operation.organizationId,
              actorId: operation.integrationAccountId,
              returnCaseId: existingRto.id,
              expectedVersion: existingRto.version,
              nextStatus: 'LOST',
              idempotencyKey: `provider-rto-lost:${operation.bookingId}:${providerEventId}`,
            });
        }
        await ingestTrackingEvidence(database, operation, event, providerEventId);
      }
      await recordCourierReconciliationObservation(database.db, {
        organizationId: operation.organizationId,
        integrationAccountId: operation.integrationAccountId,
        bookingId: operation.bookingId,
        ...(result.providerStatus ? { providerStatus: result.providerStatus } : {}),
        recognized: result.events.length > 0,
      });
    } catch (error) {
      await recordCourierReconciliationObservation(database.db, {
        organizationId: operation.organizationId,
        integrationAccountId: operation.integrationAccountId,
        bookingId: operation.bookingId,
        recognized: false,
        errorCode:
          error instanceof Error && 'code' in error && typeof error.code === 'string'
            ? error.code
            : 'TRACKING_RECONCILIATION_FAILED',
      });
    }
    processed += 1;
  }
  return processed + recovered;
}
