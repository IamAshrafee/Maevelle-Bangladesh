'use client';

import { Activity, AlertCircle, History, Instagram, Lock, Plus, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import type {
  InstagramConnectionView,
  InstagramIntegrationAvailability,
} from '@maevelle/contracts/messaging';

import { useAdminCapability } from '@/components/admin-capabilities';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/page-shell';
import { toast } from '@/components/ui/toast';
import * as api from './instagram-api';
import { InstagramConnectionOverview } from './instagram-connection-overview';
import { InstagramConnectionWizard } from './instagram-connection-wizard';
import { InstagramDisconnectDialog } from './instagram-disconnect-dialog';
import { InstagramHealthCard } from './instagram-health-card';
import { InstagramSyncCard } from './instagram-sync-card';

type Section = 'overview' | 'diagnostics' | 'sync';

export function InstagramSettingsPanel() {
  const searchParams = useSearchParams();
  const canView = useAdminCapability('messaging.connections.view');
  const canManage = useAdminCapability('messaging.connections.manage');
  const [connections, setConnections] = useState<readonly InstagramConnectionView[]>([]);
  const [availability, setAvailability] = useState<InstagramIntegrationAvailability | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [nextAvailability, nextConnections] = await Promise.all([
        api.getInstagramAvailability(),
        canView ? api.listInstagramConnections() : Promise.resolve([]),
      ]);
      setAvailability(nextAvailability);
      setConnections(nextConnections);
      setSelectedId((current) =>
        current && nextConnections.some((connection) => connection.id === current)
          ? current
          : (nextConnections.find((connection) => connection.status !== 'DISCONNECTED')?.id ??
            null),
      );
      setError('');
      setState('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Instagram settings could not be loaded.');
      setState('error');
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const result = searchParams.get('instagram');
    const returnedAttemptId = searchParams.get('attemptId');
    const errorCode = searchParams.get('error');
    if (result === 'authorized' && returnedAttemptId) {
      setAttemptId(returnedAttemptId);
      setWizardOpen(true);
    } else if (result === 'error') {
      toast.add({
        title: 'Instagram Authorization Did Not Complete',
        description: errorCode
          ? `Meta returned ${errorCode}. Start a new authorization attempt when ready.`
          : 'Start a new authorization attempt when ready.',
        type: 'warning',
      });
    } else {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('instagram');
    url.searchParams.delete('attemptId');
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url.toString());
  }, [searchParams]);

  const activeConnection = connections.find((connection) => connection.id === selectedId) ?? null;

  if (state === 'loading' && !connections.length)
    return <LoadingState message="Loading Instagram Direct settings…" className="py-12" />;

  if (state === 'error' && !connections.length)
    return (
      <ErrorState
        title="Instagram Settings Unavailable"
        message={error}
        onRetry={() => void load()}
        className="my-8"
      />
    );

  return (
    <div className="space-y-5">
      {!activeConnection ? (
        <section className="space-y-5 rounded-2xl border border-dashed border-border bg-card p-5 text-center shadow-2xs sm:p-9">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
            <Instagram className="size-8" aria-hidden="true" />
          </div>
          <div className="mx-auto max-w-xl">
            <h3 className="text-pretty text-lg font-bold tracking-tight">
              Connect Instagram Direct
            </h3>
            <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
              Receive customer DMs from an Instagram Business or Creator account and manage them in
              Maevelle’s unified inbox.
            </p>
          </div>
          <div className="mx-auto grid max-w-2xl gap-3 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Professional
                Account Only
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Requires an eligible Instagram professional account linked to an authorized Facebook
                Page.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <Lock className="size-4 text-primary" aria-hidden="true" /> Official Meta
                Authorization
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Maevelle never requests an Instagram password and does not access personal inboxes.
              </p>
            </div>
          </div>
          {availability && !availability.configured ? (
            <Alert className="mx-auto max-w-2xl border-warning/40 bg-warning/10 text-left">
              <AlertCircle className="size-4 text-warning" aria-hidden="true" />
              <AlertTitle>Instagram Server Configuration Required</AlertTitle>
              <AlertDescription>
                The Meta app credentials, callback, Graph version, or Instagram webhook verification
                token are missing. Configure the backend before starting authorization.
              </AlertDescription>
            </Alert>
          ) : null}
          {canManage ? (
            <Button
              size="lg"
              disabled={!availability?.configured}
              onClick={() => {
                setAttemptId(null);
                setWizardOpen(true);
              }}
            >
              <Instagram className="size-4" aria-hidden="true" /> Connect Professional Account
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Connection-management permission is required.
            </p>
          )}
        </section>
      ) : (
        <div className="space-y-4">
          <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
            {connections
              .filter((connection) => connection.status !== 'DISCONNECTED')
              .map((connection) => (
                <Button
                  key={connection.id}
                  variant={connection.id === activeConnection.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="shrink-0"
                  onClick={() => setSelectedId(connection.id)}
                >
                  <Instagram className="size-3.5 text-primary" aria-hidden="true" />
                  {connection.username ? `@${connection.username}` : connection.displayName}
                </Button>
              ))}
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setAttemptId(null);
                  setWizardOpen(true);
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" /> Connect Another
              </Button>
            ) : null}
          </div>

          <InstagramConnectionOverview
            connection={activeConnection}
            canManage={canManage}
            onRefresh={load}
            onReauthorize={() => {
              setAttemptId(null);
              setWizardOpen(true);
            }}
            onOpenSync={() => setSection('sync')}
            onRequestDisconnect={() => setDisconnectOpen(true)}
          />

          <nav
            className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1"
            aria-label="Instagram connection sections"
          >
            {(
              [
                ['overview', 'Overview', Activity],
                ['diagnostics', 'Permissions & Health', ShieldCheck],
                ['sync', 'Historical Sync', History],
              ] as const
            ).map(([value, label, Icon]) => (
              <Button
                key={value}
                variant={section === value ? 'secondary' : 'ghost'}
                size="sm"
                className="shrink-0"
                onClick={() => setSection(value)}
              >
                <Icon className="size-3.5" aria-hidden="true" /> {label}
              </Button>
            ))}
          </nav>

          {section === 'overview' || section === 'diagnostics' ? (
            <InstagramHealthCard
              connection={activeConnection}
              canManage={canManage}
              onRefresh={load}
            />
          ) : null}
          {section === 'sync' ? (
            <InstagramSyncCard
              connection={activeConnection}
              canManage={canManage}
              onRefreshConnection={load}
            />
          ) : null}
        </div>
      )}

      <InstagramConnectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialAttemptId={attemptId}
        onConnected={(connection) => {
          setSelectedId(connection.id);
          void load();
        }}
      />

      {activeConnection ? (
        <InstagramDisconnectDialog
          open={disconnectOpen}
          onOpenChange={setDisconnectOpen}
          connection={activeConnection}
          onDisconnected={load}
        />
      ) : null}
    </div>
  );
}
