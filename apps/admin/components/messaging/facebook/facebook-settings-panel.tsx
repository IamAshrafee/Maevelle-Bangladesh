'use client';

import {
  Activity,
  AlertCircle,
  Facebook,
  History,
  Lock,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import type {
  FacebookConnectionView,
  FacebookIntegrationAvailability,
} from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/page-shell';
import { toast } from '@/components/ui/toast';
import { useAdminCapability } from '@/components/admin-capabilities';
import * as api from './facebook-api';
import { FacebookConnectionOverview } from './facebook-connection-overview';
import { FacebookConnectionWizard } from './facebook-connection-wizard';
import { FacebookDisconnectDialog } from './facebook-disconnect-dialog';
import { FacebookHealthCard } from './facebook-health-card';
import { FacebookRoutingAssuranceDialog } from './facebook-routing-assurance-dialog';
import { FacebookSyncCard } from './facebook-sync-card';

type SectionTab = 'overview' | 'diagnostics' | 'sync';

export function FacebookSettingsPanel() {
  const searchParams = useSearchParams();

  const canView = useAdminCapability('messaging.connections.view');
  const canManage = useAdminCapability('messaging.connections.manage');

  const [connections, setConnections] = useState<readonly FacebookConnectionView[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<FacebookIntegrationAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<SectionTab>('overview');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [initialAttemptId, setInitialAttemptId] = useState<string | null>(null);
  const [routingDialogOpen, setRoutingDialogOpen] = useState(false);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);

  // Check URL params for OAuth return
  useEffect(() => {
    const facebookParam = searchParams.get('facebook');
    const attemptIdParam = searchParams.get('attemptId');
    const errorParam = searchParams.get('error');

    if (facebookParam === 'authorized' && attemptIdParam) {
      setInitialAttemptId(attemptIdParam);
      setWizardOpen(true);
      // Clean up URL query params smoothly
      const url = new URL(window.location.href);
      url.searchParams.delete('facebook');
      url.searchParams.delete('attemptId');
      window.history.replaceState({}, '', url.toString());
    } else if (facebookParam === 'error' || errorParam) {
      toast.add({
        title: 'Facebook authorization cancelled or failed',
        description: errorParam ? `Reason: ${errorParam}` : 'Please try connecting again.',
        type: 'warning',
      });
      const url = new URL(window.location.href);
      url.searchParams.delete('facebook');
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  async function loadData() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [avail, list] = await Promise.all([
        api.getFacebookAvailability().catch(() => null),
        canView ? api.listFacebookConnections().catch(() => []) : Promise.resolve([]),
      ]);
      setAvailability(avail);
      setConnections(list);
      if (list.length > 0 && !selectedConnectionId && list[0]) {
        setSelectedConnectionId(list[0].id);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load Facebook connections.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [canView]);

  const activeConnection = connections.find((c) => c.id === selectedConnectionId) ?? connections[0] ?? null;

  if (loading && !connections.length) {
    return <LoadingState message="Loading Facebook Messenger settings…" className="py-12" />;
  }

  if (errorMsg && !connections.length) {
    return (
      <ErrorState
        title="Could not load Facebook settings"
        message={errorMsg}
        onRetry={() => void loadData()}
        className="my-8"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* If No Connection exists: Show Disconnected State */}
      {!activeConnection ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 sm:p-10 text-center space-y-5 shadow-2xs">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#1877f2]/10 text-[#1877f2]">
            <Facebook className="size-8" />
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg font-bold tracking-tight text-foreground">
              Connect Facebook Messenger
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Integrate your business Facebook Page to receive customer Messenger chats, send replies, and manage conversations in Maevelle&apos;s unified inbox.
            </p>
          </div>

          {/* Safety & Prerequisite Highlights */}
          <div className="grid gap-3 max-w-xl mx-auto sm:grid-cols-2 text-left text-xs">
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" />
                Business Page Only
              </span>
              <p className="text-muted-foreground text-[11px]">
                Personal Facebook profile chats and friends are strictly isolated and never touched.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Lock className="size-3.5 text-primary" />
                Asset Protection
              </span>
              <p className="text-muted-foreground text-[11px]">
                Instagram, WhatsApp, and Meta Ad campaigns are preserved and unaffected.
              </p>
            </div>
          </div>

          {availability && !availability.configured ? (
            <Alert className="border-warning/40 bg-warning/10 text-foreground max-w-xl mx-auto text-left">
              <AlertCircle className="size-4 text-warning" />
              <AlertTitle>Server Configuration Required</AlertTitle>
              <AlertDescription className="text-xs">
                Meta App credentials are not configured yet in environment variables. Please configure <code>META_APP_ID</code> and <code>META_APP_SECRET</code> before connecting.
              </AlertDescription>
            </Alert>
          ) : null}

          {canManage ? (
            <div className="pt-2">
              <Button
                disabled={availability !== null && !availability.configured}
                onClick={() => setWizardOpen(true)}
                className="gap-2"
                size="lg"
              >
                <Facebook className="size-4" />
                Connect Facebook Page
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              You do not have administrative permission to connect messaging channels.
            </p>
          )}
        </div>
      ) : (
        /* Connected State */
        <div className="space-y-5">
          {/* Multi-Page Selector if more than 1 connected Page */}
          {connections.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <span className="text-xs font-medium text-muted-foreground shrink-0">Connected Pages:</span>
              {connections.map((c) => (
                <Button
                  key={c.id}
                  variant={c.id === activeConnection.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedConnectionId(c.id)}
                  className="gap-1.5 text-xs font-mono tabular-nums"
                >
                  <Facebook className="size-3 text-[#1877f2]" />
                  {c.pageName}
                </Button>
              ))}
              {canManage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInitialAttemptId(null);
                    setWizardOpen(true);
                  }}
                  className="gap-1 text-xs"
                >
                  <Plus className="size-3" /> Connect Another Page
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Connection Overview Header */}
          <FacebookConnectionOverview
            connection={activeConnection}
            onRefresh={loadData}
            onReauthorize={() => {
              setInitialAttemptId(null);
              setWizardOpen(true);
            }}
            onOpenRouting={() => setRoutingDialogOpen(true)}
            onOpenSync={() => setActiveTab('sync')}
            onRequestDisconnect={() => setDisconnectDialogOpen(true)}
            canManage={canManage}
          />

          {/* Section Navigation Tabs */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
            <Button
              variant={activeTab === 'overview' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('overview')}
              className="gap-1.5 text-xs"
            >
              <Activity className="size-3.5" />
              Health & Readiness
            </Button>
            <Button
              variant={activeTab === 'diagnostics' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('diagnostics')}
              className="gap-1.5 text-xs"
            >
              <ShieldCheck className="size-3.5" />
              Permissions & Webhooks
            </Button>
            <Button
              variant={activeTab === 'sync' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('sync')}
              className="gap-1.5 text-xs"
            >
              <History className="size-3.5" />
              Historical Sync
            </Button>
          </div>

          {/* Active Tab Contents */}
          {activeTab === 'overview' ? (
            <div className="space-y-4">
              <FacebookHealthCard
                connection={activeConnection}
                onRefresh={loadData}
                canManage={canManage}
              />
            </div>
          ) : null}

          {activeTab === 'diagnostics' ? (
            <FacebookHealthCard
              connection={activeConnection}
              onRefresh={loadData}
              canManage={canManage}
            />
          ) : null}

          {activeTab === 'sync' ? (
            <FacebookSyncCard
              connection={activeConnection}
              onRefreshConnection={loadData}
              canManage={canManage}
            />
          ) : null}
        </div>
      )}

      {/* Connection Wizard Modal */}
      <FacebookConnectionWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        initialAttemptId={initialAttemptId}
        onConnected={(newConn) => {
          void loadData();
          setSelectedConnectionId(newConn.id);
        }}
      />

      {/* Routing & Assurance Modal */}
      {activeConnection ? (
        <FacebookRoutingAssuranceDialog
          open={routingDialogOpen}
          onOpenChange={setRoutingDialogOpen}
          connection={activeConnection}
          onUpdated={loadData}
          canManage={canManage}
        />
      ) : null}

      {/* Disconnect Alert Dialog */}
      {activeConnection ? (
        <FacebookDisconnectDialog
          open={disconnectDialogOpen}
          onOpenChange={setDisconnectDialogOpen}
          connection={activeConnection}
          onDisconnected={loadData}
        />
      ) : null}
    </div>
  );
}
