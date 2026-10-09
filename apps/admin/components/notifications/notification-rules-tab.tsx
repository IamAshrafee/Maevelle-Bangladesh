'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  Filter,
  Info,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Users,
} from 'lucide-react';
import type { NotificationEventCatalogItemDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  NotificationChannelBadge,
  NotificationPriorityBadge,
} from './notification-status-badge';

interface PolicyRecord {
  readonly notificationType: string;
  readonly enabled: boolean;
  readonly automaticEnabled: boolean;
  readonly manualAllowed: boolean;
}

export function NotificationRulesTab() {
  const [catalog, setCatalog] = useState<readonly NotificationEventCatalogItemDto[]>([]);
  const [emailPolicies, setEmailPolicies] = useState<Record<string, PolicyRecord>>({});
  const [smsPolicies, setSmsPolicies] = useState<Record<string, PolicyRecord>>({});
  const [loading, setLoading] = useState(true);
  const [updatingType, setUpdatingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [audienceFilter, setAudienceFilter] = useState<'ALL' | 'CUSTOMER' | 'STAFF'>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogRes, emailPolRes, smsPolRes] = await Promise.all([
        apiRequest<{ data: readonly NotificationEventCatalogItemDto[] }>('/admin/notifications/catalog'),
        apiRequest<{ data: readonly PolicyRecord[] }>('/admin/email/policies').catch(() => ({ data: [] })),
        apiRequest<{ data: readonly PolicyRecord[] }>('/admin/sms/policies').catch(() => ({ data: [] })),
      ]);

      setCatalog(catalogRes.data);

      const emailMap: Record<string, PolicyRecord> = {};
      emailPolRes.data.forEach((p) => {
        emailMap[p.notificationType] = p;
      });
      setEmailPolicies(emailMap);

      const smsMap: Record<string, PolicyRecord> = {};
      smsPolRes.data.forEach((p) => {
        smsMap[p.notificationType] = p;
      });
      setSmsPolicies(smsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load event catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleEmailPolicy = async (notificationType: string, current: boolean) => {
    setUpdatingType(`${notificationType}-EMAIL`);
    try {
      await apiRequest(`/admin/email/policies/${notificationType}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: !current,
          automaticEnabled: !current,
          manualAllowed: true,
          reason: `Policy updated via Admin Notification Rules.`,
        }),
      });
      setEmailPolicies((prev) => ({
        ...prev,
        [notificationType]: {
          notificationType,
          enabled: !current,
          automaticEnabled: !current,
          manualAllowed: true,
        },
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update email policy.');
    } finally {
      setUpdatingType(null);
    }
  };

  const toggleSmsPolicy = async (notificationType: string, current: boolean) => {
    setUpdatingType(`${notificationType}-SMS`);
    try {
      await apiRequest(`/admin/sms/policies/${notificationType}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: !current,
          automaticEnabled: !current,
          manualAllowed: true,
          reason: `Policy updated via Admin Notification Rules.`,
        }),
      });
      setSmsPolicies((prev) => ({
        ...prev,
        [notificationType]: {
          notificationType,
          enabled: !current,
          automaticEnabled: !current,
          manualAllowed: true,
        },
      }));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update SMS policy.');
    } finally {
      setUpdatingType(null);
    }
  };

  const domains = React.useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((item) => {
      const parts = item.eventType.split('.');
      if (parts[0]) set.add(parts[0]);
    });
    return Array.from(set);
  }, [catalog]);

  const filteredCatalog = React.useMemo(() => {
    return catalog.filter((item) => {
      if (audienceFilter !== 'ALL' && item.audience !== audienceFilter) return false;
      if (domainFilter !== 'ALL' && !item.eventType.startsWith(`${domainFilter}.`)) return false;
      if (search.trim()) {
        const term = search.toLowerCase().trim();
        const match =
          item.eventType.toLowerCase().includes(term) ||
          item.notificationType.toLowerCase().includes(term) ||
          item.category.toLowerCase().includes(term) ||
          (item.requiredCapability && item.requiredCapability.toLowerCase().includes(term));
        if (!match) return false;
      }
      return true;
    });
  }, [audienceFilter, catalog, domainFilter, search]);

  return (
    <div className="space-y-4">
      {/* Information Header Callout */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-2xs">
        <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
          <ShieldCheck className="size-4 text-primary" />
          Authoritative Event Routing & Channel Policy
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl">
          Maevelle separates business domain truth from communication side effects. These rules govern
          which committed outbox events trigger customer and staff notifications. Security-critical
          events and mandatory commerce confirmations are strictly locked to protect operations.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Audience Filter */}
          <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40 text-xs">
            <button
              type="button"
              onClick={() => setAudienceFilter('ALL')}
              className={cn(
                'px-2.5 py-1 rounded font-medium transition-colors cursor-pointer',
                audienceFilter === 'ALL' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All Audiences
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter('CUSTOMER')}
              className={cn(
                'px-2.5 py-1 rounded font-medium transition-colors cursor-pointer',
                audienceFilter === 'CUSTOMER' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Customer
            </button>
            <button
              type="button"
              onClick={() => setAudienceFilter('STAFF')}
              className={cn(
                'px-2.5 py-1 rounded font-medium transition-colors cursor-pointer',
                audienceFilter === 'STAFF' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Internal Staff
            </button>
          </div>

          {/* Domain Filter */}
          <div className="w-36">
            <NativeSelect
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="h-8 text-xs bg-card"
            >
              <option value="ALL">All Domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>
                  {d.toUpperCase()}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search event type or capability…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void loadData()}
            className="size-8 text-muted-foreground hover:text-foreground shrink-0"
            title="Refresh rules"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Rules Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading event rules catalog…</p>
          </div>
        ) : error ? (
          <div className="p-6 text-xs text-destructive space-y-2">
            <p className="font-semibold">Unable to load rules catalog</p>
            <p>{error}</p>
            <Button size="sm" variant="outline" onClick={() => void loadData()} className="h-7 text-xs">
              Retry
            </Button>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-xs">
            No notification events matched your current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b border-border bg-muted/30 text-xs">
                  <TableHead className="font-semibold">Event Name & Notification Type</TableHead>
                  <TableHead className="w-28 font-semibold">Audience</TableHead>
                  <TableHead className="w-28 font-semibold">Priority</TableHead>
                  <TableHead className="font-semibold">Routing & Required Capability</TableHead>
                  <TableHead className="w-32 font-semibold text-center">Email Policy</TableHead>
                  <TableHead className="w-32 font-semibold text-center">SMS Policy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y divide-border">
                {filteredCatalog.map((item) => {
                  const isSecurityLocked = item.category === 'SECURITY' || item.required === true;
                  const emailPolicy = emailPolicies[item.notificationType];
                  const smsPolicy = smsPolicies[item.notificationType];

                  const emailEnabled = emailPolicy ? emailPolicy.enabled : item.audience === 'CUSTOMER';
                  const smsEnabled = smsPolicy ? smsPolicy.enabled : false;

                  return (
                    <TableRow key={`${item.eventType}-${item.notificationType}`} className="hover:bg-muted/40">
                      {/* Event Name */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <span className="font-medium text-foreground">
                            {item.notificationType.replaceAll('_', ' ')}
                          </span>
                          <code className="text-[10px] text-muted-foreground block font-mono">
                            {item.eventType}
                          </code>
                        </div>
                      </TableCell>

                      {/* Audience */}
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px]',
                            item.audience === 'CUSTOMER' ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {item.audience === 'CUSTOMER' ? 'Customer' : 'Staff'}
                        </Badge>
                      </TableCell>

                      {/* Priority */}
                      <TableCell>
                        <NotificationPriorityBadge priority={item.priority} />
                      </TableCell>

                      {/* Capability / Routing */}
                      <TableCell>
                        {item.audience === 'STAFF' && item.requiredCapability ? (
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                            <span>Requires:</span>
                            <code className="px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 text-foreground">
                              {item.requiredCapability}
                            </code>
                          </div>
                        ) : item.required ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                            <Lock className="size-3" /> Mandatory Transactional
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Standard Commerce Event</span>
                        )}
                      </TableCell>

                      {/* Email Toggle */}
                      <TableCell className="text-center">
                        {item.audience === 'CUSTOMER' ? (
                          isSecurityLocked ? (
                            <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground border-border/80">
                              <Lock className="size-2.5" /> Enforced
                            </Badge>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5">
                              <Switch
                                checked={emailEnabled}
                                disabled={updatingType === `${item.notificationType}-EMAIL`}
                                onCheckedChange={() => toggleEmailPolicy(item.notificationType, emailEnabled)}
                              />
                            </div>
                          )
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">—</span>
                        )}
                      </TableCell>

                      {/* SMS Toggle */}
                      <TableCell className="text-center">
                        {item.audience === 'CUSTOMER' ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Switch
                              checked={smsEnabled}
                              disabled={updatingType === `${item.notificationType}-SMS`}
                              onCheckedChange={() => toggleSmsPolicy(item.notificationType, smsEnabled)}
                            />
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
