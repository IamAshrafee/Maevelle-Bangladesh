import 'server-only';

import { storefrontPublicBaseUrl } from '@/lib/env/storefront';

export function canonicalPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? '/' : normalized.replace(/\/+$/, '');
}

export function absoluteStorefrontUrl(pathname: string): string {
  return new URL(canonicalPath(pathname), `${storefrontPublicBaseUrl}/`).toString();
}
