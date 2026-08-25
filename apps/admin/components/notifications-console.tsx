'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { NotificationsWorkspace } from '@/components/notifications/notifications-workspace';
import { IntegrationsWorkspace } from '@/components/integrations/integrations-workspace';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

type Notification = {
  id: string;
  notification_type: string;
  channel: string;
  status: string;
  rendered_body: string;
  created_at: string;
  source_domain: string;
  revision_number: number | null;
  attempts:
    | readonly { attemptNumber: number; status: string; provider: string; errorCode?: string }[]
    | null;
};
type Row = Record<string, unknown> & { id?: string; status?: string };
type Integrations = {
  health: readonly Row[];
  accounts: readonly Row[];
  operations: readonly Row[];
  providerEvents: readonly Row[];
  exceptions: readonly Row[];
  mappings: readonly Row[];
  webhooks: readonly Row[];
  webhookDeliveries: readonly Row[];
};

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('The protected request was rejected.');
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function NotificationsConsole({ integrations = false }: { integrations?: boolean }) {
  const [notifications, setNotifications] = useState<readonly Notification[]>([]);
  const [integrationData, setIntegrationData] = useState<Integrations>();
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (integrations) {
        setIntegrationData((await request<ApiEnvelope<Integrations>>('/admin/integrations')).data);
      } else {
        setNotifications((await request<ApiEnvelope<readonly Notification[]>>('/admin/notifications')).data);
      }
    } catch {
      toast.error('Unable to load this protected operational view.');
    } finally {
      setLoading(false);
    }
  }, [integrations]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 flex flex-col min-w-0 p-6 overflow-hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            {integrations ? 'Integrations' : 'Notifications'}
          </h1>
          <p className="text-muted-foreground mb-6">
            {integrations 
              ? 'Manage third-party connectors, webhooks, and background sync operations.'
              : 'Event-driven messaging hub for Email, SMS, and Webhook triggers.'}
          </p>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground">Loading...</div>
        ) : (
          integrations ? (
            <IntegrationsWorkspace integrationData={integrationData} />
          ) : (
            <NotificationsWorkspace notifications={notifications as any[]} reload={reload} />
          )
        )}
      </div>
    </main>
  );
}
