import { describe, expect, it } from 'vitest';

import {
  createSteadfastProvider,
  normalizeSteadfastStatus,
  STEADFAST_PROVIDER_CODE,
} from './steadfast.js';

describe('steadfast courier integration', () => {
  it('normalizes Steadfast courier delivery and return statuses', () => {
    expect(normalizeSteadfastStatus('in_review')).toBe('BOOKED');
    expect(normalizeSteadfastStatus('pending')).toBe('BOOKED');
    expect(normalizeSteadfastStatus('picked')).toBe('HANDED_OVER');
    expect(normalizeSteadfastStatus('in_transit')).toBe('IN_TRANSIT');
    expect(normalizeSteadfastStatus('delivered')).toBe('DELIVERED');
    expect(normalizeSteadfastStatus('partial_delivered')).toBe('DELIVERED');
    expect(normalizeSteadfastStatus('cancelled')).toBe('CANCELLED');
    expect(normalizeSteadfastStatus('hold')).toBe('ATTEMPT_FAILED');
    expect(normalizeSteadfastStatus('return')).toBe('RETURNING');
    expect(normalizeSteadfastStatus('returned')).toBe('RETURNED_TO_ORIGIN');
    expect(normalizeSteadfastStatus('unknown')).toBeUndefined();
    expect(normalizeSteadfastStatus('some_unrecognized_status')).toBeUndefined();
  });

  it('declares nationwide serviceability for Bangladesh', async () => {
    const provider = await createSteadfastProvider(
      {
        environment: 'PRODUCTION',
        capabilities: {
          booking: true,
          cancellation: false,
          tracking: true,
          webhooks: true,
          cod: true,
          codUpdate: false,
          returnTracking: true,
          serviceability: true,
          quoting: false,
        },
      },
      { apiKey: 'test-api-key', secretKey: 'test-secret-key' },
    );

    expect(provider.providerCode).toBe(STEADFAST_PROVIDER_CODE);
    const serviceability = await provider.checkServiceability?.({ district: 'Dhaka' });
    expect(serviceability?.serviceable).toBe(true);
  });

  it('creates a consignment booking through Steadfast API and captures consignment ID', async () => {
    const mockFetch: typeof fetch = async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('/create_order')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.invoice).toBe('DEL-2026-001');
        expect(body.recipient_name).toBe('Rahim Ahmed');
        expect(body.cod_amount).toBe(1200);

        return new Response(
          JSON.stringify({
            status: 200,
            message: 'Order created successfully',
            consignment: {
              consignment_id: 887766,
              invoice: 'DEL-2026-001',
              tracking_code: 'STF12345678',
              recipient_name: 'Rahim Ahmed',
              status: 'in_review',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const provider = await createSteadfastProvider(
      {
        environment: 'PRODUCTION',
        capabilities: {
          booking: true,
          cancellation: false,
          tracking: true,
          webhooks: true,
          cod: true,
          codUpdate: false,
          returnTracking: true,
          serviceability: true,
          quoting: false,
        },
      },
      { apiKey: 'test-api-key', secretKey: 'test-secret-key' },
      mockFetch,
    );

    const result = await provider.createBooking({
      deliveryId: 'del-123',
      merchantReference: 'DEL-2026-001',
      pickup: { locationId: 'loc-123' },
      recipient: {
        name: 'Rahim Ahmed',
        phone: '01711000000',
        address: 'House 1, Road 2, Dhanmondi, Dhaka',
      },
      cod: {
        required: true,
        expectedAmount: '1200',
        currency: 'BDT',
      },
      packages: [
        {
          packageNumber: 1,
          weight: { value: '1.5', unit: 'KG' },
        },
      ],
      contents: {
        quantity: 2,
        description: 'Cotton Shirt x2',
      },
    });

    expect(result.kind).toBe('BOOKED');
    if (result.kind === 'BOOKED') {
      expect(result.providerBookingId).toBe('887766');
      expect(result.trackingReference).toBe('STF12345678');
      expect(result.providerStatus).toBe('in_review');
    }
  });

  it('tracks consignment and returns normalized tracking event', async () => {
    const mockFetch: typeof fetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/status_by_cid/887766')) {
        return new Response(
          JSON.stringify({
            status: 200,
            delivery_status: 'delivered',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('Not Found', { status: 404 });
    };

    const provider = await createSteadfastProvider(
      {
        environment: 'PRODUCTION',
        capabilities: {
          booking: true,
          cancellation: false,
          tracking: true,
          webhooks: true,
          cod: true,
          codUpdate: false,
          returnTracking: true,
          serviceability: true,
          quoting: false,
        },
      },
      { apiKey: 'test-api-key', secretKey: 'test-secret-key' },
      mockFetch,
    );

    const tracking = await provider.getBooking?.('887766');
    expect(tracking?.providerBookingId).toBe('887766');
    expect(tracking?.events).toHaveLength(1);
    expect(tracking?.events[0]!.normalizedStatus).toBe('DELIVERED');
  });

  it('queries official Steadfast fraud check endpoint and parses customer parcel history', async () => {
    let requestedUrl = '';
    let apiKeyHeader = '';
    let secretKeyHeader = '';

    const mockFetch: typeof fetch = async (url, init) => {
      requestedUrl = String(url);
      const h = init?.headers as Record<string, string>;
      apiKeyHeader = h?.['Api-Key'] ?? '';
      secretKeyHeader = h?.['Secret-Key'] ?? '';

      return new Response(
        JSON.stringify({
          status: 200,
          Total_parcels: 14,
          total_delivered: 11,
          total_cancelled: 3,
          total_fraud_reports: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const result = await (await import('./steadfast.js')).checkSteadfastCustomerFraud(
      { environment: 'PRODUCTION' },
      { apiKey: 'my-api-key', secretKey: 'my-secret-key' },
      '+8801712345678',
      mockFetch,
    );

    expect(requestedUrl).toContain('/fraud_check/01712345678');
    expect(apiKeyHeader).toBe('my-api-key');
    expect(secretKeyHeader).toBe('my-secret-key');
    expect(result.available).toBe(true);
    expect(result.phone).toBe('01712345678');
    expect(result.totalParcels).toBe(14);
    expect(result.deliveredCount).toBe(11);
    expect(result.cancelledCount).toBe(3);
    expect(result.fraudReportsCount).toBe(0);
    expect(result.successRate).toBe(78.57);
  });

  it('handles Steadfast fraud check failure gracefully without throwing', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Gateway Timeout', { status: 504 });
    };

    const result = await (await import('./steadfast.js')).checkSteadfastCustomerFraud(
      { environment: 'PRODUCTION' },
      { apiKey: 'my-api-key', secretKey: 'my-secret-key' },
      '01812345678',
      mockFetch,
    );

    expect(result.available).toBe(false);
    expect(result.phone).toBe('01812345678');
    expect(result.totalParcels).toBe(0);
    expect(result.deliveredCount).toBe(0);
    expect(result.cancelledCount).toBe(0);
    expect(result.error).toBe('HTTP_504');
  });
});
