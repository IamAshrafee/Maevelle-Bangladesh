import { isIP, SocketAddress } from 'node:net';
import type { FastifyRequest } from 'fastify';

function canonicalIp(value: string | undefined): string | undefined {
  if (!value || value.includes('%')) return undefined;
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6) return undefined;
  const { address } = new SocketAddress({ address: value, family: 'ipv6' });
  return address.replace(/^::ffff:(?=\d+\.)/, '');
}

/** This address is used only for durable quotas. Host and protocol trust remain separate. */
export function rateLimitClientIp(
  request: FastifyRequest,
  trustedGatewayIp: string | undefined,
): string | undefined {
  const peer = canonicalIp(request.ip);
  if (!peer || peer !== canonicalIp(trustedGatewayIp)) return peer;
  const forwarded = request.headers['x-maevelle-client-ip'];
  return typeof forwarded === 'string' ? canonicalIp(forwarded) : undefined;
}
