import { describe, expect, it } from 'vitest';

import { CatalogDomainError } from '@maevelle/database/catalog';

import { sendCatalogDomainError } from './catalog-support.js';

describe('Catalog domain error transport', () => {
  it('preserves structured published Variant recovery details in a conflict response', () => {
    let statusCode = 0;
    let payload: unknown;
    const reply = {
      code(code: number) {
        statusCode = code;
        return {
          send(body: unknown) {
            payload = body;
            return body;
          },
        };
      },
    };
    const details = {
      recoveryAction: 'UNPUBLISH_AND_RECONFIGURE',
      affectedVariantCount: 1,
      affectedVariants: [{ id: crypto.randomUUID(), sku: 'DRESS-SMALL', title: 'Small' }],
    };

    sendCatalogDomainError(
      reply,
      new CatalogDomainError(
        'OPTION_STRUCTURE_IN_USE',
        'The option value is used by an active Variant.',
        details,
      ),
    );

    expect(statusCode).toBe(409);
    expect(payload).toEqual({
      error: {
        code: 'OPTION_STRUCTURE_IN_USE',
        message: 'The option value is used by an active Variant.',
        details,
      },
    });
  });
});
