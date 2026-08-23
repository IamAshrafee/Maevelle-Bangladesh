'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';

type Profile = {
  display_name: string;
  timezone: string;
  default_locale: string;
  default_currency: string;
  business_profile: Record<string, unknown> | null;
  storefront_profile: Record<string, unknown> | null;
};
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('Settings request was rejected.');
  return response.json() as Promise<T>;
}
export function SettingsConsole() {
  const [profile, setProfile] = useState<Profile>();
  const [message, setMessage] = useState('Loading typed organization settings…');
  const reload = async () => {
    try {
      setProfile((await request<ApiEnvelope<Profile>>('/admin/settings/organization')).data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load settings.');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/settings/organization', {
        method: 'PUT',
        body: JSON.stringify({
          businessProfile: { businessName: data.get('businessName') },
          storefrontProfile: { publicStoreName: data.get('publicStoreName') },
        }),
      });
      setMessage('Settings updated. Historical Orders retain their snapshots.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings update was rejected.');
    }
  };
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Maevelle / Settings</p>
        <h1>Organization settings</h1>
        <p>Structured profiles are versioned separately from feature flags and secrets.</p>
        <p role="status">{message}</p>
        <p>
          Organization: {profile?.display_name ?? '—'} · {profile?.timezone ?? '—'} ·{' '}
          {profile?.default_currency ?? '—'}
        </p>
        <form onSubmit={(event) => void save(event)}>
          <label>
            Business name{' '}
            <input
              defaultValue={String(profile?.business_profile?.businessName ?? '')}
              name="businessName"
              maxLength={160}
            />
          </label>
          <label>
            Public store name{' '}
            <input
              defaultValue={String(profile?.storefront_profile?.publicStoreName ?? '')}
              name="publicStoreName"
              maxLength={160}
            />
          </label>
          <button type="submit">Save settings</button>
        </form>
      </section>
    </main>
  );
}
