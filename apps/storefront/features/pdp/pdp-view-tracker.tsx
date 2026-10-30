'use client';

import { useEffect, useRef } from 'react';
import type { CommerceItemDto } from '@maevelle/contracts';
import { currentCommerceConsent } from '@/lib/analytics/consent';
import {
  createBrowserCommerceEvent,
  publishCommerceEvent,
  storefrontAnalyticsSessionId,
} from '@/lib/analytics/events';

export function PdpViewTracker({ item }: { item: CommerceItemDto }) {
  const sent = useRef(false);
  useEffect(() => {
    const publish = () => {
      if (sent.current) return;
      const consent = currentCommerceConsent();
      if (consent.analytics !== 'GRANTED') return;
      sent.current = true;
      publishCommerceEvent(
        createBrowserCommerceEvent({
          name: 'PRODUCT_VIEWED',
          consent,
          sessionId: storefrontAnalyticsSessionId(),
          data: { item },
        }),
      );
    };
    publish();
    window.addEventListener('maevelle:consent-changed', publish);
    return () => window.removeEventListener('maevelle:consent-changed', publish);
  }, [item]);
  return null;
}
