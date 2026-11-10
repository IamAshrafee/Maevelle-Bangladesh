'use client';
import { useState } from 'react';
import type { PrivacyPreferencesDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/selection-control';
import { savePrivacyChoices } from '@/lib/analytics/consent';

export function PrivacyPreferencesForm({
  snapshot,
  busy,
}: {
  snapshot: PrivacyPreferencesDto;
  busy: boolean;
}) {
  const [analytics, setAnalytics] = useState(
    snapshot.purposes.ANALYTICS.effectiveDecision === 'GRANTED',
  );
  const [advertising, setAdvertising] = useState(
    snapshot.purposes.ADVERTISING.effectiveDecision === 'GRANTED',
  );
  const changed =
    analytics !== (snapshot.purposes.ANALYTICS.effectiveDecision === 'GRANTED') ||
    advertising !== (snapshot.purposes.ADVERTISING.effectiveDecision === 'GRANTED');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void savePrivacyChoices(analytics, advertising);
      }}
      className="space-y-4"
      aria-busy={busy}
    >
      <div className="rounded-xl border border-border bg-surface-container-low p-3 text-body-sm">
        <p className="font-semibold">Essential operations — always available</p>
        <p className="mt-1 text-on-surface-variant">
          Security, your shopping bag, Checkout and Order support need some information. These are
          separate from optional measurement.
        </p>
      </div>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-body-sm font-semibold">Optional purposes</legend>
        <Checkbox
          className="min-h-12"
          label="Analytics"
          description="Count permitted site interactions to understand and improve your experience."
          checked={analytics}
          onChange={(event) => setAnalytics(event.target.checked)}
        />
        <Checkbox
          className="min-h-12"
          label="Advertising"
          description="Remember your choice for optional marketing measurement. Advertising exports are currently inactive."
          checked={advertising}
          onChange={(event) => setAdvertising(event.target.checked)}
        />
      </fieldset>
      <p className="text-body-sm text-on-surface-variant">
        {snapshot.scope === 'ACCOUNT'
          ? 'Your account and this browser both control optional measurement. A new browser or account asks you to confirm choices.'
          : 'These choices belong to this browser preference session. Anonymous choices do not carry across devices.'}
      </p>
      {snapshot.purposes.ANALYTICS.expiresAt ? (
        <p className="text-caption text-on-surface-variant">
          Current analytics preference expires{' '}
          {new Date(snapshot.purposes.ANALYTICS.expiresAt).toLocaleDateString('en-BD')}.
        </p>
      ) : null}
      {changed ? (
        <p className="text-body-sm" role="status">
          Unsaved changes. They are not saved until the server confirms.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => {
            setAnalytics(false);
            setAdvertising(false);
            void savePrivacyChoices(false, false);
          }}
        >
          Decline optional purposes
        </Button>
        <Button
          variant="outline"
          className="w-full"
          type="submit"
          loading={busy}
          loadingLabel="Saving choices"
        >
          Save selected purposes
        </Button>
      </div>
      <p className="text-caption text-on-surface-variant">
        Declining does not prevent shopping. You can reopen Privacy choices in the footer.{' '}
        <a href="/policies/privacy" className="underline underline-offset-4">
          Read our privacy information
        </a>
        .
      </p>
    </form>
  );
}
