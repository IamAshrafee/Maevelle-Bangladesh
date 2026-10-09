'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Filter,
  Info,
  Loader2,
  Lock,
  Mail,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Sliders,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import type { NotificationEventCatalogItemDto, NotificationPreferenceDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { NotificationPriorityBadge } from './notification-status-badge';

interface PreferenceState {
  inApp: boolean;
  email: boolean;
}

export function NotificationPreferencesTab() {
  const [catalog, setCatalog] = useState<readonly NotificationEventCatalogItemDto[]>([]);
  const [preferences, setPreferences] = useState<Record<string, PreferenceState>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogRes, prefsRes] = await Promise.all([
        apiRequest<{ data: readonly NotificationEventCatalogItemDto[] }>('/admin/notifications/catalog'),
        apiRequest<{ data: readonly NotificationPreferenceDto[] }>('/admin/notifications/preferences/me'),
      ]);

      // Only staff-targeted events are relevant to staff personal preferences
      const staffEvents = catalogRes.data.filter((item) => item.audience === 'STAFF');
      setCatalog(staffEvents);

      // Build preference lookup
      const prefMap: Record<string, PreferenceState> = {};
      // Default all to enabled unless explicitly turned off
      for (const event of staffEvents) {
        prefMap[event.notificationType] = { inApp: true, email: true };
      }

      for (const pref of prefsRes.data) {
        const existing = prefMap[pref.notification_type] ?? { inApp: true, email: true };
        if (pref.channel === 'IN_APP') {
          existing.inApp = pref.enabled;
        } else if (pref.channel === 'EMAIL') {
          existing.email = pref.enabled;
        }
        prefMap[pref.notification_type] = existing;
      }

      setPreferences(prefMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal preferences.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const handleToggle = async (
    notificationType: string,
    channel: 'IN_APP' | 'EMAIL',
    nextEnabled: boolean,
  ) => {
    const key = `${notificationType}-${channel}`;
    setSavingKey(key);

    // Optimistic update
    const prev = preferences[notificationType] ?? { inApp: true, email: true };
    setPreferences((prevMap) => ({
      ...prevMap,
      [notificationType]: {
        ...prev,
        [channel === 'IN_APP' ? 'inApp' : 'email']: nextEnabled,
      },
    }));

    try {
      await apiRequest('/admin/notifications/preferences/me', {
        method: 'POST',
        body: JSON.stringify({
          notificationType,
          channel,
          enabled: nextEnabled,
        }),
      });
    } catch (err) {
      // Rollback
      setPreferences((prevMap) => ({
        ...prevMap,
        [notificationType]: prev,
      }));
      setError(err instanceof Error ? err.message : 'Failed to save preference.');
    } finally {
      setSavingKey(null);
    }
  };

  const filteredCatalog = catalog.filter((item) => {
    if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      item.notificationType.toLowerCase().includes(term) ||
      item.eventType.toLowerCase().includes(term) ||
      (item.requiredCapability && item.requiredCapability.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header and Explanation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Sliders className="size-5 text-primary" />
            My Personal Notification Preferences
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure which operational events trigger alerts for your account across In-App staff inbox and your work email.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadPreferences()}
          disabled={loading}
          className="h-8 gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Distinction Callout */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-2xs">
        <div className="flex items-start gap-3">
          <Info className="size-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <p className="font-semibold text-foreground">
              Personal Inbox vs Organization Routing Policies
            </p>
            <p className="text-muted-foreground leading-relaxed">
              These preferences control notifications sent directly to <strong>you as an individual team member</strong>.
              Whether an event occurs at all and who gets notified is governed by the organization&apos;s{' '}
              <span className="font-medium text-foreground">Notification Rules</span> and role permissions.
              Security-critical alerts cannot be muted.
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'OPERATIONAL', 'SECURITY', 'SYSTEM'].map((cat) => (
            <Button
              key={cat}
              variant={categoryFilter === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategoryFilter(cat)}
              className="h-7 text-xs px-2.5"
            >
              {cat === 'ALL' ? 'All Alerts' : cat.charAt(0) + cat.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-[260px]">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search alerts or permissions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs bg-card"
          />
        </div>
      </div>

      {/* Error alert if any */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-6 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Preferences Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xs">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary mb-2" />
            <p className="text-xs">Loading personal preferences…</p>
          </div>
        ) : filteredCatalog.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-xs">
            No notification alert types match your current filter.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40 border-b border-border text-xs">
                <TableHead className="w-[320px] font-semibold">Event / Alert Name</TableHead>
                <TableHead className="w-[120px] font-semibold">Priority</TableHead>
                <TableHead className="font-semibold">Required Staff Capability</TableHead>
                <TableHead className="w-[140px] text-center font-semibold">
                  <div className="flex items-center justify-center gap-1.5">
                    <Bell className="size-3.5 text-primary" />
                    <span>In-App Inbox</span>
                  </div>
                </TableHead>
                <TableHead className="w-[140px] text-center font-semibold">
                  <div className="flex items-center justify-center gap-1.5">
                    <Mail className="size-3.5 text-sky-500" />
                    <span>Work Email</span>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="text-xs divide-y divide-border">
              {filteredCatalog.map((item) => {
                const isSecurityLocked = item.category === 'SECURITY';
                const currentPref = preferences[item.notificationType] ?? { inApp: true, email: true };
                const inAppSaving = savingKey === `${item.notificationType}-IN_APP`;
                const emailSaving = savingKey === `${item.notificationType}-EMAIL`;

                return (
                  <TableRow key={item.notificationType} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium text-foreground text-xs flex items-center gap-1.5">
                          {item.notificationType.replace(/_/g, ' ')}
                          {isSecurityLocked && (
                            <span title="Mandatory Security Alert">
                              <Lock className="size-3 text-muted-foreground" />
                            </span>
                          )}
                        </div>
                        <code className="text-[10px] text-muted-foreground block font-mono">
                          {item.eventType}
                        </code>
                      </div>
                    </TableCell>

                    <TableCell>
                      <NotificationPriorityBadge priority={item.priority} />
                    </TableCell>

                    <TableCell>
                      {item.requiredCapability ? (
                        <div className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground">
                          <code className="px-1.5 py-0.5 rounded bg-muted/60 border border-border text-foreground">
                            {item.requiredCapability}
                          </code>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">All Staff</span>
                      )}
                    </TableCell>

                    {/* In-App Toggle */}
                    <TableCell className="text-center">
                      {isSecurityLocked ? (
                        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground font-medium">
                          <Lock className="size-3 text-muted-foreground/80" />
                          <span>Always On</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={currentPref.inApp}
                            disabled={inAppSaving}
                            onCheckedChange={(checked) =>
                              handleToggle(item.notificationType, 'IN_APP', checked)
                            }
                          />
                        </div>
                      )}
                    </TableCell>

                    {/* Email Toggle */}
                    <TableCell className="text-center">
                      {isSecurityLocked ? (
                        <div className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground font-medium">
                          <Lock className="size-3 text-muted-foreground/80" />
                          <span>Always On</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={currentPref.email}
                            disabled={emailSaving}
                            onCheckedChange={(checked) =>
                              handleToggle(item.notificationType, 'EMAIL', checked)
                            }
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
