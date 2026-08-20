import { randomUUID } from 'node:crypto';
import type { DestinationStream, Logger, LoggerOptions as PinoLoggerOptions } from 'pino';
import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerContext {
  readonly component?: string;
  readonly correlationId?: string;
  readonly requestId?: string;
  readonly organizationId?: string;
}

export interface LoggerOptions extends LoggerContext {
  readonly level: LogLevel;
}

const redactedPaths = [
  'password',
  '*.password',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'sessionToken',
  '*.sessionToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'req.headers.authorization',
  'req.headers.cookie',
];

export function createLogger(options: LoggerOptions, destination?: DestinationStream): Logger {
  const loggerOptions: PinoLoggerOptions = {
    level: options.level,
    base: {
      ...(options.component ? { component: options.component } : {}),
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
      ...(options.organizationId ? { organizationId: options.organizationId } : {}),
    },
    redact: {
      paths: redactedPaths,
      censor: '[REDACTED]',
    },
  };

  return destination ? pino(loggerOptions, destination) : pino(loggerOptions);
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function resolveCorrelationId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (candidate && /^[A-Za-z0-9._-]{1,128}$/.test(candidate)) {
    return candidate;
  }

  return createCorrelationId();
}

export function withLogContext(logger: Logger, context: LoggerContext): Logger {
  return logger.child(context);
}
