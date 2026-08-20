import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger, resolveCorrelationId, withLogContext } from './index.js';

describe('observability foundation', () => {
  it('redacts sensitive fields while retaining safe correlation context', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = withLogContext(createLogger({ component: 'test', level: 'info' }, destination), {
      correlationId: 'correlation-123',
    });

    logger.info(
      {
        password: 'never-log-this',
        authorization: 'Bearer never-log-this',
        nested: { apiKey: 'never-log-this' },
      },
      'safe event',
    );

    expect(output).toContain('correlation-123');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('never-log-this');
  });

  it('uses a supplied safe correlation ID and replaces unsafe input', () => {
    expect(resolveCorrelationId('request-123')).toBe('request-123');
    expect(resolveCorrelationId('contains spaces')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
