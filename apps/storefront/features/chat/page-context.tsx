'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import type { ChatPageContext } from './types';

const CONTEXT_EVENT = 'maevelle:chat-context';

let productContext: Pick<ChatPageContext, 'productId' | 'variantId' | 'productTitle'> | null = null;

function pageType(path: string): ChatPageContext['pageType'] {
  if (path === '/') return 'HOME';
  if (path.startsWith('/products/')) return 'PRODUCT';
  if (path.startsWith('/categories') || path.startsWith('/search')) return 'CATEGORY';
  if (path.startsWith('/cart')) return 'CART';
  if (path.startsWith('/checkout')) return 'CHECKOUT';
  return 'OTHER';
}

export function currentChatPageContext(path: string): ChatPageContext {
  const type = pageType(path);
  return {
    pageType: type,
    path: path.startsWith('/') ? path.slice(0, 500) : '/',
    productId: type === 'PRODUCT' ? (productContext?.productId ?? null) : null,
    variantId: type === 'PRODUCT' ? (productContext?.variantId ?? null) : null,
    productTitle: type === 'PRODUCT' ? (productContext?.productTitle ?? null) : null,
  };
}

export function subscribeToChatContext(listener: () => void): () => void {
  window.addEventListener(CONTEXT_EVENT, listener);
  return () => window.removeEventListener(CONTEXT_EVENT, listener);
}

export function ChatProductContext({
  productId,
  productTitle,
  variantId,
}: {
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId?: string | null;
}) {
  const pathname = usePathname();

  useEffect(() => {
    productContext = { productId, productTitle, variantId: variantId ?? null };
    window.dispatchEvent(new Event(CONTEXT_EVENT));
    return () => {
      if (productContext?.productId === productId) productContext = null;
      window.dispatchEvent(new Event(CONTEXT_EVENT));
    };
  }, [pathname, productId, productTitle, variantId]);

  return null;
}
