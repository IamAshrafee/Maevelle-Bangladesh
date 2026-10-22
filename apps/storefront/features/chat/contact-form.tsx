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
      <div className="rounded-2xl border border-success/30 bg-success-subtle p-3.5 text-body-sm text-success-foreground">
        <p className="font-semibold">Contact details saved</p>
        <p className="mt-0.5 text-label-sm text-success-foreground/80">
          Our team can use these details to follow up with you.
        </p>
      </div>
    );

  if (!open)
    return (
      <button
        className="flex min-h-11 items-center rounded-xl px-2 text-body-sm font-semibold text-primary transition-colors duration-150 hover:bg-primary-subtle active:scale-98"
        onClick={() => setOpen(true)}
        type="button"
      >
        Share contact details (optional)
      </button>
    );

  return (
    <form
      className="space-y-3 rounded-2xl border border-border-subtle bg-surface-container-low p-4 shadow-xs"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmedName = details.name.trim();
        const trimmedEmail = details.email.trim();
        const trimmedPhone = details.phone.trim();

        if (!trimmedName && !trimmedEmail && !trimmedPhone) {
          setError('Please add at least one contact detail.');
          return;
        }

        if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
          setError('Please enter a valid email address.');
          return;
        }

        if (trimmedPhone && !/^[+0-9\s-]{6,16}$/.test(trimmedPhone)) {
          setError('Please enter a valid phone number (e.g. +8801700000000).');
          return;
        }

        setSaving(true);
        setError(null);
        void onSave({
          name: trimmedName,
          email: trimmedEmail,
          phone: trimmedPhone,
          emailConsent: details.emailConsent,
          phoneConsent: details.phoneConsent,
        })
          .catch(() =>
            setError('We could not save those details. Please check them and try again.'),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div>
        <h3 className="text-label-md font-semibold text-on-surface">How may we reach you?</h3>
        <p className="mt-0.5 text-label-sm text-on-surface-variant">
          Optional. Used by support to follow up if you leave the chat.
        </p>
      </div>

      <label className="block text-label-md font-medium text-on-surface">
        Name
        <Input
          autoComplete="name"
          className="mt-1"
          maxLength={160}
          onChange={(event) => setDetails({ ...details, name: event.target.value })}
          placeholder="Your name"
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
          placeholder="you@example.com"
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
          placeholder="+880 1…"
          type="tel"
          value={details.phone}
        />
      </label>

      {details.email.trim() ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-body-sm text-on-surface">
          <input
            checked={details.emailConsent}
            className="size-4 accent-primary"
            onChange={(event) => setDetails({ ...details, emailConsent: event.target.checked })}
            type="checkbox"
          />
          You may follow up by email
        </label>
      ) : null}

      {details.phone.trim() ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-body-sm text-on-surface">
          <input
            checked={details.phoneConsent}
            className="size-4 accent-primary"
            onChange={(event) => setDetails({ ...details, phoneConsent: event.target.checked })}
            type="checkbox"
          />
          You may follow up by phone / SMS
        </label>
      ) : null}

      {error ? (
        <p className="text-body-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2 pt-1">
        <Button loading={saving} size="sm" type="submit">
          Save details
        </Button>
        <Button onClick={() => setOpen(false)} size="sm" variant="ghost">
          Not now
        </Button>
      </div>
    </form>
  );
}
