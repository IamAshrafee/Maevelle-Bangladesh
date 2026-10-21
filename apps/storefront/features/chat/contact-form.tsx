'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { ContactDetails } from './types';

const EMPTY: ContactDetails = {
  name: '',
  email: '',
  phone: '',
  emailConsent: false,
  phoneConsent: false,
};

export function ContactForm({
  saved,
  onSave,
}: {
  readonly saved: boolean;
  readonly onSave: (details: ContactDetails) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (saved)
    return (
      <p className="rounded-xl bg-success-subtle px-3 py-2 text-body-sm text-success-foreground">
        Contact details saved. They are not treated as verified.
      </p>
    );
  if (!open)
    return (
      <button
        className="min-h-11 self-start rounded-xl px-2 text-body-sm font-semibold text-primary hover:bg-primary-subtle"
        onClick={() => setOpen(true)}
        type="button"
      >
        Share contact details (optional)
      </button>
    );
  return (
    <form
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface-container-low p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!details.name.trim() && !details.email.trim() && !details.phone.trim()) {
          setError('Add at least one contact detail.');
          return;
        }
        setSaving(true);
        setError(null);
        void onSave(details)
          .catch(() =>
            setError('We could not save those details. Please check them and try again.'),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div>
        <h3 className="text-label-md font-semibold text-on-surface">How may we reach you?</h3>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">
          Optional. Submitted details are not verified.
        </p>
      </div>
      <label className="block text-label-md font-medium text-on-surface">
        Name
        <Input
          autoComplete="name"
          className="mt-1"
          maxLength={160}
          onChange={(event) => setDetails({ ...details, name: event.target.value })}
          value={details.name}
        />
      </label>
      <label className="block text-label-md font-medium text-on-surface">
        Email
        <Input
          autoComplete="email"
          className="mt-1"
          maxLength={254}
          onChange={(event) => setDetails({ ...details, email: event.target.value })}
          type="email"
          value={details.email}
        />
      </label>
      <label className="block text-label-md font-medium text-on-surface">
        Phone
        <Input
          autoComplete="tel"
          className="mt-1"
          maxLength={16}
          onChange={(event) => setDetails({ ...details, phone: event.target.value })}
          placeholder="+880…"
          type="tel"
          value={details.phone}
        />
      </label>
      {details.email ? (
        <label className="flex min-h-10 items-center gap-2 text-body-sm text-on-surface">
          <input
            checked={details.emailConsent}
            className="size-4 accent-primary"
            onChange={(event) => setDetails({ ...details, emailConsent: event.target.checked })}
            type="checkbox"
          />
          You may contact me by email
        </label>
      ) : null}
      {details.phone ? (
        <label className="flex min-h-10 items-center gap-2 text-body-sm text-on-surface">
          <input
            checked={details.phoneConsent}
            className="size-4 accent-primary"
            onChange={(event) => setDetails({ ...details, phoneConsent: event.target.checked })}
            type="checkbox"
          />
          You may contact me by phone
        </label>
      ) : null}
      {error ? (
        <p className="text-body-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button loading={saving} size="sm" type="submit">
          Save
        </Button>
        <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
          Not now
        </Button>
      </div>
    </form>
  );
}
