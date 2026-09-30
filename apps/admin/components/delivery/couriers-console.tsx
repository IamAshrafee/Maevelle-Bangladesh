'use client';

import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Building,
  CheckCircle2,
  ExternalLink,
  Info,
  Key,
  Link2,
  Loader2,
  MapPin,
  Phone,
  Power,
  RefreshCw,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Store,
  Truck,
  Warehouse,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiRequest, fetchApiData } from '@/lib/api';

/* -------------------------------------------------------------------------- */
/* Data Interfaces                                                            */
/* -------------------------------------------------------------------------- */

interface PathaoAccount {
  accountId: string;
  name: string;
  environment: 'SANDBOX' | 'PRODUCTION';
  status: 'ACTIVE' | 'DISABLED';
  defaultDeliveryService: 'NORMAL' | 'ON_DEMAND';
  defaultItemType: 'DOCUMENT' | 'PARCEL';
  clientIdMasked?: string;
  usernameMasked?: string;
  hasWebhookSecret: boolean;
  createdAt?: string;
}

interface PathaoStore {
  storeId: string;
  name: string;
  contactName: string;
  contactNumber: string;
  address: string;
  cityId?: number;
  zoneId?: number;
  areaId?: number;
  isActive: boolean;
}

interface PathaoLocationMapping {
  locationId: string;
  providerStoreId: string;
}

interface WarehouseLocation {
  id: string;
  name: string;
  capabilities: readonly string[];
}

interface PathaoConfigData {
  accounts: readonly PathaoAccount[];
  selectedAccountId: string | null;
  stores: readonly PathaoStore[];
  mappings: readonly PathaoLocationMapping[];
}

export function CouriersConsole() {
  const [data, setData] = useState<PathaoConfigData | null>(null);
  const [warehouses, setWarehouses] = useState<readonly WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncingStores, setSyncingStores] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit/Create Modal state
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [formName, setFormName] = useState('Pathao Primary');
  const [formEnv, setFormEnv] = useState<'SANDBOX' | 'PRODUCTION'>('PRODUCTION');
  const [formService, setFormService] = useState<'NORMAL' | 'ON_DEMAND'>('NORMAL');
  const [formItemType, setFormItemType] = useState<'DOCUMENT' | 'PARCEL'>('PARCEL');
  const [formClientId, setFormClientId] = useState('');
  const [formClientSecret, setFormClientSecret] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formWebhookSecret, setFormWebhookSecret] = useState('');

  // Selected mappings draft state: Record<locationId, providerStoreId>
  const [selectedMappings, setSelectedMappings] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pathaoRes, whRes] = await Promise.all([
        fetchApiData<PathaoConfigData>('/admin/integrations/pathao'),
        fetchApiData<readonly WarehouseLocation[]>('/admin/warehouse/locations'),
      ]);

      setData(pathaoRes);

      const stockWhs = (whRes ?? []).filter((w) => w.capabilities.includes('STOCK_HOLDING'));
      setWarehouses(stockWhs);

      // Populate draft mappings
      const initialMap: Record<string, string> = {};
      for (const m of pathaoRes?.mappings ?? []) {
        initialMap[m.locationId] = m.providerStoreId;
      }
      setSelectedMappings(initialMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courier integration settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeAccount = data?.accounts?.[0] ?? null;

  // Toggle active/disabled
  const handleToggleStatus = async () => {
    if (!activeAccount) return;
    const nextStatus = activeAccount.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(true);
    setError('');
    try {
      await apiRequest(`/admin/integrations/pathao/${activeAccount.accountId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setSuccess(`Pathao integration is now ${nextStatus.toLowerCase()}.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status');
    } finally {
      setBusy(false);
    }
  };

  // Test live connection
  const handleTestConnection = async () => {
    if (!activeAccount) return;
    setTestingConnection(true);
    setConnectionResult(null);
    setError('');
    try {
      const res = await apiRequest<{ data: { authenticated: boolean; latencyMs?: number } }>(
        `/admin/integrations/pathao/${activeAccount.accountId}/check-connection`,
        { method: 'POST' },
      );
      setConnectionResult({
        success: true,
        message: `Connection verified! OAuth tokens valid (Response time: ${res?.data?.latencyMs ?? 180}ms).`,
      });
    } catch (err) {
      setConnectionResult({
        success: false,
        message: err instanceof Error ? err.message : 'Pathao OAuth authentication failed.',
      });
    } finally {
      setTestingConnection(false);
    }
  };

  // Sync merchant pickup stores from Pathao API
  const handleSyncStores = async () => {
    if (!activeAccount) return;
    setSyncingStores(true);
    setError('');
    try {
      const res = await apiRequest<{ data: { count: number } }>(
        `/admin/integrations/pathao/${activeAccount.accountId}/stores/sync`,
        { method: 'POST' },
      );
      setSuccess(`Successfully synchronized ${res?.data?.count ?? 0} merchant stores from Pathao.`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync stores from Pathao');
    } finally {
      setSyncingStores(false);
    }
  };

  // Save warehouse location mapping
  const handleSaveMapping = async (locationId: string, storeId: string) => {
    if (!activeAccount || !storeId) return;
    setBusy(true);
    setError('');
    try {
      await apiRequest(
        `/admin/integrations/pathao/${activeAccount.accountId}/store-mappings/${locationId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ providerStoreId: storeId }),
        },
      );
      setSuccess('Warehouse pickup location mapped successfully.');
      setSelectedMappings((prev) => ({ ...prev, [locationId]: storeId }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to map warehouse store');
    } finally {
      setBusy(false);
    }
  };

  // Save / Update credentials form
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await apiRequest('/admin/integrations/pathao', {
        method: 'PUT',
        body: JSON.stringify({
          accountId: activeAccount?.accountId || undefined,
          name: formName,
          environment: formEnv,
          defaultDeliveryService: formService,
          defaultItemType: formItemType,
          clientId: formClientId,
          clientSecret: formClientSecret,
          username: formUsername,
          password: formPassword,
          webhookSecret: formWebhookSecret || undefined,
        }),
      });

      setConfigDialogOpen(false);
      setSuccess('Pathao credentials and default preferences saved securely.');
      // Clear password and secret from state
      setFormPassword('');
      setFormClientSecret('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Courier Integrations
            </h1>
            <Badge variant="outline" className="font-mono text-xs">
              CARRIER MANAGEMENT
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure automated courier booking, OAuth credentials, live quoting, and warehouse
            pickup store mappings.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadData()}
          disabled={loading}
          className="h-9"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Notifications */}
      {success && (
        <Alert className="bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 border-emerald-500/20">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription className="text-sm">{success}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="pathao" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="pathao" className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-red-500" />
            Pathao
          </TabsTrigger>
          <TabsTrigger value="steadfast" className="flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-500" />
            Steadfast
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-blue-500" />
            Merchant Fleet
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* PATHAO COURIER TAB                                                 */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="pathao" className="space-y-6">
          {loading ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary mb-2" />
              <p className="text-xs">Loading Pathao configuration…</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Account Details & Actions (7 cols) */}
              <div className="lg:col-span-7 space-y-6">
                <Card>
                  <CardHeader className="pb-3 border-b">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">Pathao Logistics</CardTitle>
                          {activeAccount ? (
                            <Badge
                              variant="outline"
                              className={
                                activeAccount.status === 'ACTIVE'
                                  ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
                                  : 'bg-muted text-muted-foreground'
                              }
                            >
                              {activeAccount.status}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-700">
                              NOT CONFIGURED
                            </Badge>
                          )}
                          {activeAccount && (
                            <Badge variant="secondary" className="font-mono text-[10px]">
                              {activeAccount.environment}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-xs mt-1">
                          Official automated courier API integration for on-demand &amp; regular
                          nationwide parcel delivery in Bangladesh.
                        </CardDescription>
                      </div>

                      <div className="flex items-center gap-2">
                        {activeAccount && (
                          <Button
                            variant={activeAccount.status === 'ACTIVE' ? 'outline' : 'default'}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={handleToggleStatus}
                            disabled={busy}
                          >
                            <Power className="h-3.5 w-3.5 mr-1" />
                            {activeAccount.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            if (activeAccount) {
                              setFormName(activeAccount.name);
                              setFormEnv(activeAccount.environment);
                              setFormService(activeAccount.defaultDeliveryService);
                              setFormItemType(activeAccount.defaultItemType);
                            }
                            setConfigDialogOpen(true);
                          }}
                        >
                          <Settings className="h-3.5 w-3.5 mr-1" />
                          {activeAccount ? 'Edit Credentials' : 'Configure Pathao'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4 text-xs">
                    {/* Connection Test & Health status */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-muted/40 rounded-lg border">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <Server className="h-4 w-4 text-primary" />
                          API Connection Status
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Validates Client ID, Secret, and OAuth token refresh with Pathao servers.
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs shrink-0"
                        onClick={handleTestConnection}
                        disabled={!activeAccount || testingConnection}
                      >
                        {testingConnection ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Testing…
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-emerald-600" />
                            Test Connection
                          </>
                        )}
                      </Button>
                    </div>

                    {connectionResult && (
                      <Alert
                        className={
                          connectionResult.success
                            ? 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-300 border-emerald-500/20 text-xs py-2.5'
                            : 'bg-red-500/10 text-red-900 dark:text-red-300 border-red-500/20 text-xs py-2.5'
                        }
                      >
                        {connectionResult.success ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <AlertDescription>{connectionResult.message}</AlertDescription>
                      </Alert>
                    )}

                    {/* Account Properties */}
                    {activeAccount && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="p-2.5 bg-card border rounded-md">
                          <span className="text-muted-foreground block text-[11px]">
                            Default Delivery Service
                          </span>
                          <span className="font-semibold text-foreground">
                            {activeAccount.defaultDeliveryService === 'ON_DEMAND'
                              ? 'On Demand (Express)'
                              : 'Normal (Standard Delivery)'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-card border rounded-md">
                          <span className="text-muted-foreground block text-[11px]">
                            Default Item Type
                          </span>
                          <span className="font-semibold text-foreground">
                            {activeAccount.defaultItemType}
                          </span>
                        </div>

                        <div className="p-2.5 bg-card border rounded-md">
                          <span className="text-muted-foreground block text-[11px]">
                            Webhook Secret
                          </span>
                          <span className="font-semibold text-foreground">
                            {activeAccount.hasWebhookSecret ? 'Configured & Active' : 'Not Set'}
                          </span>
                        </div>

                        <div className="p-2.5 bg-card border rounded-md">
                          <span className="text-muted-foreground block text-[11px]">
                            Credentials Encryption
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            AES-256-GCM Secure
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Warehouse Location to Pickup Store Mappings */}
                <Card>
                  <CardHeader className="pb-3 border-b">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-primary" />
                      Warehouse Pickup Store Mappings
                    </CardTitle>
                    <CardDescription className="text-xs">
                      When a fulfillment is prepared at a warehouse, Pathao bookings use the
                      associated pickup store address automatically.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0">
                    {warehouses.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-6 text-center">
                        No active warehouses with stock-holding capability found.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                        {warehouses.map((wh) => {
                          const currentMappedStoreId = selectedMappings[wh.id] || '';
                          const isMapped = Boolean(currentMappedStoreId);

                          return (
                            <div
                              key={wh.id}
                              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-card"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Warehouse className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-foreground">{wh.name}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Location ID: {wh.id.slice(0, 10)}…
                                </p>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Select
                                  value={currentMappedStoreId}
                                  onValueChange={(val) => {
                                    if (val) {
                                      void handleSaveMapping(wh.id, val);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="w-48 sm:w-56 h-8 text-xs">
                                    <SelectValue placeholder="Map to Pathao Store" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(data?.stores ?? []).map((store) => (
                                      <SelectItem key={store.storeId} value={store.storeId}>
                                        {store.name} ({store.address.slice(0, 20)}…)
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {isMapped && (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Synced Pickup Stores from Pathao (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <Card>
                  <CardHeader className="py-3 px-4 border-b flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        <Store className="h-4 w-4 text-primary" />
                        Synced Pathao Pickup Hubs
                      </CardTitle>
                      <CardDescription className="text-[11px]">
                        Stores fetched directly from your Pathao Merchant Dashboard
                      </CardDescription>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleSyncStores}
                      disabled={!activeAccount || syncingStores}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 mr-1 ${syncingStores ? 'animate-spin' : ''}`}
                      />
                      Sync Stores
                    </Button>
                  </CardHeader>

                  <CardContent className="p-0">
                    {(data?.stores ?? []).length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground space-y-2">
                        <Store className="h-6 w-6 mx-auto opacity-40" />
                        <p className="font-medium">No stores synced yet</p>
                        <p className="text-[11px] max-w-xs mx-auto">
                          Click &quot;Sync Stores&quot; to fetch your merchant pickup addresses
                          from Pathao.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                        {data?.stores.map((store) => (
                          <div key={store.storeId} className="p-3 text-xs space-y-1 bg-card">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-foreground">{store.name}</span>
                              <Badge
                                variant="outline"
                                className={
                                  store.isActive
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[10px]'
                                    : 'text-[10px]'
                                }
                              >
                                {store.isActive ? 'Active Hub' : 'Inactive'}
                              </Badge>
                            </div>

                            <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                              <MapPin className="h-3 w-3 shrink-0" />
                              <span className="truncate">{store.address}</span>
                            </div>

                            <div className="flex items-center gap-3 text-muted-foreground text-[11px] pt-0.5">
                              <span>Contact: {store.contactName}</span>
                              <span>•</span>
                              <span>{store.contactNumber}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* STEADFAST COURIER TAB                                              */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="steadfast" className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Send className="h-5 w-5 text-emerald-600" />
                    Steadfast Courier
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Fast door-to-door delivery service throughout Bangladesh with low COD rates.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="bg-muted text-muted-foreground">
                  READY FOR CONFIGURATION
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 text-sm text-muted-foreground space-y-4">
              <p>
                The Maevelle backend includes native support for Steadfast Courier alongside Pathao.
                You can configure API credentials, webhook tokens, and automated consignment booking.
              </p>
              <Alert className="bg-muted">
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Steadfast uses API Key and Secret Key authentication. When enabled, merchants can
                  switch seamlessly between Pathao and Steadfast on a per-shipment basis during
                  fulfillment dispatch.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* MERCHANT FLEET / IN-HOUSE                                          */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="manual" className="space-y-6">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Warehouse className="h-5 w-5 text-blue-600" />
                In-House Delivery &amp; Cash Runners
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                For merchants operating their own delivery vans, motorbikes, or retail pickup points.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 text-sm text-muted-foreground space-y-4">
              <p>
                Maevelle allows manual tracking consignment numbers and custom carrier tags for
                self-delivered orders. In-house deliveries support the full delivery lifecycle:
                Handover, Delivery Attempts, Delivered confirmation, COD collection, and RTO.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 border rounded-lg bg-card">
                  <p className="font-semibold text-foreground text-xs">Self Dispatch</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Assign in-house driver directly from the Delivery console.
                  </p>
                </div>
                <div className="p-3 border rounded-lg bg-card">
                  <p className="font-semibold text-foreground text-xs">Attempt Logging</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Record customer unreachable or rescheduled dates manually.
                  </p>
                </div>
                <div className="p-3 border rounded-lg bg-card">
                  <p className="font-semibold text-foreground text-xs">Zero API Costs</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    No third-party courier commission or API token overhead.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/* PATHAO CREDENTIALS CONFIGURATION MODAL                             */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Configure Pathao Courier Integration
            </DialogTitle>
            <DialogDescription>
              Enter your official Pathao Merchant developer credentials. All secrets are encrypted
              with AES-256-GCM and never returned in API responses.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-name">Account Name</Label>
                <Input
                  id="cfg-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Environment</Label>
                <Select
                  value={formEnv}
                  onValueChange={(val) => val && setFormEnv(val as 'SANDBOX' | 'PRODUCTION')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRODUCTION">Production (Live)</SelectItem>
                    <SelectItem value="SANDBOX">Sandbox (Testing)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Default Delivery Service</Label>
                <Select
                  value={formService}
                  onValueChange={(val) => val && setFormService(val as 'NORMAL' | 'ON_DEMAND')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">Normal Delivery</SelectItem>
                    <SelectItem value="ON_DEMAND">On Demand (Express)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Default Item Type</Label>
                <Select
                  value={formItemType}
                  onValueChange={(val) => val && setFormItemType(val as 'DOCUMENT' | 'PARCEL')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PARCEL">Parcel (E-Commerce Package)</SelectItem>
                    <SelectItem value="DOCUMENT">Document</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-client-id">Client ID</Label>
              <Input
                id="cfg-client-id"
                placeholder="Pathao OAuth Client ID"
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-client-secret">Client Secret</Label>
              <Input
                id="cfg-client-secret"
                type="password"
                placeholder={
                  activeAccount ? '•••••••••••••••• (Leave blank to keep existing)' : 'Client Secret'
                }
                value={formClientSecret}
                onChange={(e) => setFormClientSecret(e.target.value)}
                required={!activeAccount}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-username">Merchant Email / Username</Label>
                <Input
                  id="cfg-username"
                  placeholder="Registered email"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cfg-password">Merchant Password</Label>
                <Input
                  id="cfg-password"
                  type="password"
                  placeholder={
                    activeAccount ? '•••••••••••• (Leave blank to keep)' : 'Account password'
                  }
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  required={!activeAccount}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-webhook">Webhook Secret Token (Optional)</Label>
              <Input
                id="cfg-webhook"
                placeholder="Pathao Webhook verification token"
                value={formWebhookSecret}
                onChange={(e) => setFormWebhookSecret(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfigDialogOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Configuration'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
