'use client';
import { useEffect, useSyncExternalStore } from 'react';
import {
  subscribePrivacy,
  privacyClientState,
  privacyServerState,
  loadPrivacyPreferences,
  invalidatePrivacyPreferences,
  privacySignalKey,
} from '@/lib/analytics/consent';
import {
  SHOPPER_TRANSITION_EVENT,
  SHOPPER_TRANSITION_STORAGE,
  SHOPPER_AUTH_STORAGE,
} from '@/lib/auth/shopper-transitions';

export function usePrivacyPreferences() {
  const state = useSyncExternalStore(subscribePrivacy, privacyClientState, privacyServerState);
  useEffect(() => {
    void loadPrivacyPreferences();
    let transitioning = false;
    const refresh = () => {
      invalidatePrivacyPreferences();
      if (!transitioning) void loadPrivacyPreferences();
    };
    const storage = (event: StorageEvent) => {
      if (
        !event.key ||
        [privacySignalKey, SHOPPER_TRANSITION_STORAGE, SHOPPER_AUTH_STORAGE].includes(event.key)
      ) {
        invalidatePrivacyPreferences();
        if (!transitioning)
          void loadPrivacyPreferences(
            'Privacy choices changed in another tab. Review the current choices before saving.',
          );
      }
    };
    const identity = (event: Event) => {
      transitioning = (event as CustomEvent<{ phase?: string }>).detail?.phase === 'begin';
      invalidatePrivacyPreferences();
      if (!transitioning) void loadPrivacyPreferences();
    };
    const visibility = () => {
      if (document.visibilityState === 'visible') refresh();
      else invalidatePrivacyPreferences();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('focus', refresh);
    window.addEventListener(SHOPPER_TRANSITION_EVENT, identity);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SHOPPER_TRANSITION_EVENT, identity);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return state;
}
