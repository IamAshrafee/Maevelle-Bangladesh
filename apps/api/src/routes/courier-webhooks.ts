import type { FastifyInstance } from 'fastify';
import { Type } from 'typebox';

import type { DatabaseClient } from '@maevelle/database';
import {
  findCourierBookingForWebhook,
  ingestCourierTrackingEvent,
} from '@maevelle/database/delivery';
import { normalizePathaoStatus } from '@maevelle/database/pathao';
import { normalizeSteadfastStatus } from '@maevelle/database/steadfast';
import {
  getRtoCaseForDelivery,
  initiateRto,
  transitionReturnTransport,
} from '@maevelle/database/returns';

export function registerCourierWebhookRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
): void {
  app.post(
    '/webhooks/courier/:providerCode',
    {
      schema: {
        params: Type.Object({ providerCode: Type.String({ minLength: 1 }) }),
      },
    },
    async (request, reply) => {
      const providerCode = (request.params as { providerCode: string }).providerCode.toUpperCase();
      const rawBody = (request.body ?? {}) as Record<string, unknown>;
      const body = (typeof rawBody.data === 'object' && rawBody.data !== null && !Array.isArray(rawBody.data)
        ? rawBody.data
        : rawBody) as Record<string, unknown>;

      if (providerCode === 'PATHAO') {
        const signature =
          (request.headers['x-pathao-signature'] as string | undefined) ??
          (request.headers['x-signature'] as string | undefined);
        if (signature) {
          reply.header('X-Pathao-Merchant-Webhook-Integration-Secret', signature);
        }
      }

      // Extract provider identifiers from common payloads
      const externalBookingId =
        (typeof body.consignment_id === 'string' && body.consignment_id) ||
        (typeof body.consignment_id === 'number' && String(body.consignment_id)) ||
        (typeof rawBody.consignment_id === 'string' && rawBody.consignment_id) ||
        (typeof rawBody.consignment_id === 'number' && String(rawBody.consignment_id)) ||
        (typeof body.consignmentId === 'string' && body.consignmentId) ||
        (typeof body.tracking_code === 'string' && body.tracking_code) ||
        (typeof body.tracking_number === 'string' && body.tracking_number) ||
        (typeof body.order_id === 'string' && body.order_id) ||
        undefined;

      const merchantInvoice =
        (typeof body.invoice === 'string' && body.invoice) ||
        (typeof body.merchant_order_id === 'string' && body.merchant_order_id) ||
        (typeof rawBody.invoice === 'string' && rawBody.invoice) ||
        (typeof rawBody.merchant_order_id === 'string' && rawBody.merchant_order_id) ||
        undefined;

      const rawStatus =
        (typeof body.status === 'string' && body.status) ||
        (typeof body.order_status === 'string' && body.order_status) ||
        (typeof rawBody.order_status === 'string' && rawBody.order_status) ||
        (typeof rawBody.status === 'string' && rawBody.status) ||
        (typeof body.notification_type === 'string' && body.notification_type) ||
        '';

      const normalizedStatus =
        providerCode === 'STEADFAST'
          ? normalizeSteadfastStatus(rawStatus)
          : providerCode === 'PATHAO'
            ? normalizePathaoStatus(rawStatus)
            : undefined;

      if (!normalizedStatus) {
        // Acknowledge receipt even for unmapped or heartbeat statuses
        return reply.code(200).send({ received: true, mapped: false });
      }

      // Find active courier booking
      const booking = await findCourierBookingForWebhook(database.db, {
        providerCode,
        ...(externalBookingId ? { externalBookingId } : {}),
        ...(merchantInvoice ? { merchantInvoice } : {}),
      });

      if (!booking) {
        // Unknown booking reference, acknowledge to prevent repeated provider retries
        return reply.code(200).send({ received: true, matched: false });
      }

      const eventId =
        (typeof body.event_id === 'string' && body.event_id) ||
        (typeof body.updated_at === 'string' && `${booking.bookingId}:${body.updated_at}`) ||
        `${booking.bookingId}:${Date.now()}`;

      try {
        await ingestCourierTrackingEvent(database.db, {
          organizationId: booking.organizationId,
          integrationAccountId: booking.integrationAccountId,
          courierBookingId: booking.bookingId,
          providerEventId: eventId,
          providerStatus: rawStatus,
          normalizedStatus,
          occurredAt: new Date(),
          authenticationStatus: 'NOT_APPLICABLE',
          rawPayload: body,
        });

        // Trigger RTO flow if return events are reported
        if (['RTO_INITIATED', 'RETURNING', 'RETURNED_TO_ORIGIN'].includes(normalizedStatus)) {
          let rto = await getRtoCaseForDelivery(database.db, {
            organizationId: booking.organizationId,
            deliveryId: booking.deliveryId,
          });

          if (!rto) {
            await initiateRto(database.db, {
              organizationId: booking.organizationId,
              actorId: booking.integrationAccountId,
              deliveryId: booking.deliveryId,
              idempotencyKey: `webhook-rto:${booking.bookingId}:${eventId}`,
            });
            rto = await getRtoCaseForDelivery(database.db, {
              organizationId: booking.organizationId,
              deliveryId: booking.deliveryId,
            });
          }

          if (rto) {
            const nextTransportStatus =
              normalizedStatus === 'RETURNED_TO_ORIGIN'
                ? 'ARRIVED'
                : normalizedStatus === 'RETURNING'
                  ? 'IN_TRANSIT'
                  : undefined;

            const transitionNeeded =
              nextTransportStatus === 'ARRIVED'
                ? !['ARRIVED', 'LOST'].includes(rto.transportStatus)
                : nextTransportStatus === 'IN_TRANSIT'
                  ? ['NOT_STARTED', 'EXPECTED'].includes(rto.transportStatus)
                  : false;

            if (nextTransportStatus && transitionNeeded) {
              await transitionReturnTransport(database.db, {
                organizationId: booking.organizationId,
                actorId: booking.integrationAccountId,
                returnCaseId: rto.id,
                expectedVersion: rto.version,
                nextStatus: nextTransportStatus,
                idempotencyKey: `webhook-return-transport:${rto.id}:${eventId}`,
              });
            }
          }
        }

        return reply.code(200).send({ received: true, matched: true, status: normalizedStatus });
      } catch (err) {
        request.log.error(err, 'Courier webhook processing error');
        return reply.code(200).send({ received: true, error: 'PROCESSING_ERROR' });
      }
    },
  );
}
