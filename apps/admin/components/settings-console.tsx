'use client';

import { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { SettingsWorkspace } from '@/components/settings/settings-workspace';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

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
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      setProfile((await request<ApiEnvelope<Profile>>('/admin/settings/organization')).data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Organization Settings</h1>
          <p className="text-muted-foreground mb-6">
            Global tenant configurations, team access control, and bulk data operations.
          </p>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">Loading typed organization settings…</div>
        ) : (
          <SettingsWorkspace profile={profile} reload={reload} />
        )}
      </div>
    </main>
  );
}
