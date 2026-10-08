import Fastify from 'fastify';
import { Type } from 'typebox';
import { describe, expect, it } from 'vitest';

import { catalogAttributeValueParameter, isCatalogAttributeValue } from './catalog.js';

describe('catalog attribute request values', () => {
  it('preserves false as a boolean through Fastify validation', async () => {
    const app = Fastify({ logger: false });
    app.post(
      '/',
      { schema: { body: Type.Object({ value: catalogAttributeValueParameter }) } },
      async (request) => ({ value: (request.body as { value: unknown }).value }),
    );

    const response = await app.inject({ method: 'POST', url: '/', payload: { value: false } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ value: false });
    expect(typeof response.json<{ value: unknown }>().value).toBe('boolean');
    await app.close();
  });

  it('accepts only the catalog attribute primitive contract', () => {
    expect([null, true, false, 'Cotton'].every(isCatalogAttributeValue)).toBe(true);
    expect(isCatalogAttributeValue({ unsafe: true })).toBe(false);
    expect(isCatalogAttributeValue('x'.repeat(2_001))).toBe(false);
  });
});
