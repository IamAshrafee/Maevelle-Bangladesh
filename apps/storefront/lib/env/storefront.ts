import 'server-only';

function origin(value: string, variableName: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
    return url.origin;
  } catch {
    throw new Error(`${variableName} must be a valid HTTP(S) origin.`);
  }
}

export const storefrontPublicBaseUrl = origin(
  process.env.STOREFRONT_BASE_URL ?? 'http://localhost:8080',
  'STOREFRONT_BASE_URL',
);

export const storefrontInternalApiUrl = origin(
  process.env.STOREFRONT_INTERNAL_API_URL ?? 'http://127.0.0.1:3000',
  'STOREFRONT_INTERNAL_API_URL',
);
