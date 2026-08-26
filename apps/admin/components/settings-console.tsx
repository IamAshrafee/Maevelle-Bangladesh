'use client';

import { Building2, RefreshCw, Save, Store } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { OperationalFeedback, OperationalPageHeader } from './operational-worklist';

type Profile = {
  readonly display_name: string;
  readonly timezone: string;
  readonly default_locale: string;
  readonly default_currency: string;
  readonly schema_version: number | null;
  readonly business_profile: Record<string, unknown> | null;
  readonly storefront_profile: Record<string, unknown> | null;
  readonly updated_at: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'Settings request was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

export function SettingsConsole() {
  const [profile, setProfile] = useState<Profile>();
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setProfile((await request<{ data: Profile }>('/admin/settings/organization')).data);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load settings.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (!dirty) return;
    const warning = 'You have unsaved organization settings. Leave without saving?';
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guardNavigation = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]');
      if (!anchor || anchor.target || anchor.href.startsWith('#')) return;
      if (!window.confirm(warning)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDirty(false);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', guardNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', guardNavigation, true);
    };
  }, [dirty]);

  function refresh() {
    if (dirty && !window.confirm('Discard unsaved organization settings and refresh?')) return;
    setDirty(false);
    void reload();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await request('/admin/settings/organization', {
        method: 'PUT',
        body: JSON.stringify({
          businessProfile: {
            businessName: String(data.get('businessName') ?? '').trim(),
            lowStockThreshold: Number(data.get('lowStockThreshold') ?? 0),
            supportEmail: String(data.get('supportEmail') ?? '').trim(),
            supportPhone: String(data.get('supportPhone') ?? '').trim(),
          },
          storefrontProfile: {
            publicStoreName: String(data.get('publicStoreName') ?? '').trim(),
            announcement: String(data.get('announcement') ?? '').trim(),
          },
        }),
      });
      setDirty(false);
      await reload();
      setMessage('Organization settings updated. Historical business snapshots remain unchanged.');
      setTone('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Settings update was rejected.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Settings / Organization"
          title="Organization settings"
          description="Manage typed business and Storefront presentation profiles without mixing secrets into operational settings."
          actions={
            <button className="button secondary" type="button" onClick={refresh}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="metric-strip">
          <article>
            <span>Organization</span>
            <strong>{profile?.display_name ?? '—'}</strong>
            <small>tenant identity</small>
          </article>
          <article>
            <span>Timezone</span>
            <strong>{profile?.timezone ?? '—'}</strong>
            <small>operational display</small>
          </article>
          <article>
            <span>Locale</span>
            <strong>{profile?.default_locale ?? '—'}</strong>
            <small>default language</small>
          </article>
          <article>
            <span>Currency</span>
            <strong>{profile?.default_currency ?? '—'}</strong>
            <small>commercial default</small>
          </article>
        </section>
        {loading ? (
          <div className="skeleton-list" aria-label="Loading settings">
            <span />
            <span />
            <span />
          </div>
        ) : profile ? (
          <form
            className="settings-grid"
            key={profile.updated_at ?? 'new'}
            onChange={() => setDirty(true)}
            onSubmit={(event) => void save(event)}
          >
            <section className="panel inset-form">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Business profile</p>
                  <h2>Operator-facing identity</h2>
                </div>
                <Building2 aria-hidden="true" />
              </div>
              <label>
                Business name
                <input
                  defaultValue={String(profile.business_profile?.businessName ?? '')}
                  name="businessName"
                  maxLength={160}
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Support email
                  <input
                    defaultValue={String(profile.business_profile?.supportEmail ?? '')}
                    name="supportEmail"
                    type="email"
                    autoComplete="email"
                  />
                </label>
                <label>
                  Support phone
                  <input
                    defaultValue={String(profile.business_profile?.supportPhone ?? '')}
                    name="supportPhone"
                    type="tel"
                    autoComplete="tel"
                  />
                </label>
              </div>
              <label>
                Low-stock attention threshold
                <input
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={Number(profile.business_profile?.lowStockThreshold ?? 0)}
                  name="lowStockThreshold"
                  required
                />
              </label>
              <OperationalFeedback tone="warning">
                Core organization timezone, locale, and currency are identity settings and are
                intentionally read-only in this profile editor.
              </OperationalFeedback>
            </section>
            <section className="panel inset-form">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Storefront profile</p>
                  <h2>Customer-facing identity</h2>
                </div>
                <Store aria-hidden="true" />
              </div>
              <label>
                Public store name
                <input
                  defaultValue={String(profile.storefront_profile?.publicStoreName ?? '')}
                  name="publicStoreName"
                  maxLength={160}
                  required
                />
              </label>
              <label>
                Announcement
                <textarea
                  defaultValue={String(profile.storefront_profile?.announcement ?? '')}
                  name="announcement"
                  rows={4}
                  maxLength={500}
                  placeholder="Optional message shown by supported Storefront surfaces"
                />
              </label>
              <p>
                Profile fields are additive: saving these values preserves unrelated versioned
                settings already stored by other features.
              </p>
            </section>
            <footer className="settings-actions">
              <small>
                Schema version {profile.schema_version ?? 1}
                {profile.updated_at
                  ? ` · Last updated ${new Date(profile.updated_at).toLocaleString()}`
                  : ''}
              </small>
              <button className="button primary" disabled={busy} type="submit">
                <Save aria-hidden="true" /> {busy ? 'Saving…' : 'Save settings'}
              </button>
            </footer>
          </form>
        ) : null}
      </section>
    </main>
  );
}
