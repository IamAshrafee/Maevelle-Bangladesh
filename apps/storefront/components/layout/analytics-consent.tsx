'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ModalDialog } from '@/components/ui/modal-dialog';
import { PrivacyPreferencesForm } from '@/features/privacy/privacy-preferences-form';
import { usePrivacyPreferences } from '@/features/privacy/use-privacy-preferences';
import {
  loadPrivacyPreferences,
  currentObservationAuthority,
  savePrivacyChoices,
} from '@/lib/analytics/consent';

export function AnalyticsConsent() {
  const state = usePrivacyPreferences();
  const [open, setOpen] = useState(false),
    [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const reopen = () => {
      setOpen(true);
      void loadPrivacyPreferences();
    };
    window.addEventListener('maevelle:open-consent', reopen);
    return () => window.removeEventListener('maevelle:open-consent', reopen);
  }, []);
  const undecided =
    state.snapshot &&
    Object.values(state.snapshot.purposes).some((v) => v.effectiveDecision === 'UNKNOWN');
  const key = state.snapshot
    ? `${state.snapshot.context}:${state.snapshot.purposes.ANALYTICS.revision}:${state.snapshot.purposes.ANALYTICS.browserRevision}:${state.snapshot.purposes.ADVERTISING.revision}:${state.snapshot.purposes.ADVERTISING.browserRevision}`
    : 'loading';
  return (
    <>
      {!open && (
        <span className="sr-only" role="status" aria-live="polite">
          {state.message}
        </span>
      )}
      {!open && !dismissed && undecided ? (
        <aside
          aria-label="Privacy choices"
          className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-lg rounded-xl border border-border bg-surface-container-lowest p-4 shadow-lg md:bottom-4"
        >
          <p className="font-semibold">Your privacy choices</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Optional measurement stays off until you choose. Advertising exports are inactive.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => void savePrivacyChoices(false, false)}>
              Decline optional purposes
            </Button>
            <Button variant="outline" onClick={() => setOpen(true)}>
              Choose preferences
            </Button>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              Not now
            </Button>
          </div>
        </aside>
      ) : null}
      <ModalDialog
        open={open}
        fallbackFocusSelector="[data-privacy-entry]"
        title="Privacy preferences"
        onClose={() => {
          setOpen(false);
          setDismissed(true);
        }}
        description="Choose analytics and advertising independently. Unknown choices keep optional measurement off."
      >
        <div className="space-y-4">
          {state.message ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl border border-border bg-surface-container-low p-3 text-body-sm"
            >
              {state.message}
            </p>
          ) : null}
          {state.phase === 'loading' || state.phase === 'unresolved' ? (
            <p role="status">Loading your current choices…</p>
          ) : null}
          {state.phase === 'unavailable' ? (
            <Button variant="outline" onClick={() => void loadPrivacyPreferences()}>
              Reload privacy choices
            </Button>
          ) : null}
          {state.snapshot ? (
            <PrivacyPreferencesForm
              key={key}
              snapshot={state.snapshot}
              busy={state.phase === 'saving'}
            />
          ) : null}
          {state.snapshot ? (
            <p className="text-caption text-on-surface-variant">
              {currentObservationAuthority()
                ? 'Optional first-party analytics is permitted for this session.'
                : 'Optional analytics is paused or not permitted here.'}{' '}
              Third-party exports are inactive.
            </p>
          ) : null}
        </div>
      </ModalDialog>
    </>
  );
}
