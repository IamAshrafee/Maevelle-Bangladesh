'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  CreditCard,
  HardDrive,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  Lock,
  Mail,
  Palette,
  Plug,
  RefreshCw,
  Ruler,
  Search,
  Server,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SettingStatusBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type {
  ConfigurationHealthResponseDto,
  SettingsListResponseDto,
} from '@maevelle/contracts';

interface SearchableItem {
  id: string;
  title: string;
  category: string;
  description: string;
  href: string;
  keywords: string;
}

export function SettingsOverviewConsole() {
  const [settingsData, setSettingsData] = useState<SettingsListResponseDto>();
  const [healthData, setHealthData] = useState<ConfigurationHealthResponseDto>();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, healthRes] = await Promise.all([
        fetchApiData<SettingsListResponseDto>('/admin/settings'),
        fetchApiData<ConfigurationHealthResponseDto>('/admin/settings/health').catch(() => undefined),
      ]);
      if (listRes) setSettingsData(listRes);
      if (healthRes) setHealthData(healthRes);
    } catch {
      // Handled silently for offline or initial load
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Index all individual settings and sections for fast client-side discovery
  const searchableIndex = useMemo<SearchableItem[]>(() => {
    const list: SearchableItem[] = [
      {
        id: 'email-master',
        title: 'Transactional Email Dispatch',
        category: 'Email',
        description: 'Enable or disable customer notifications for orders, payments, and shipments.',
        href: '/email?tab=settings',
        keywords: 'email transactional orders notifications delivery resend enabled',
      },
      {
        id: 'email-sender',
        title: 'Email Sender Identity & Reply-To',
        category: 'Email',
        description: 'Brand display name, from address, and customer support Reply-To inbox.',
        href: '/email?tab=settings',
        keywords: 'sender name from address reply-to support email identity',
      },
      {
        id: 'email-safety',
        title: 'Test Recipient Override & Allow-List',
        category: 'Email',
        description: 'Non-production email safety rules, allowed test recipients, and redirects.',
        href: '/email?tab=settings',
        keywords: 'test recipients testing allow list override safety development',
      },
      {
        id: 'resend-integration',
        title: 'Resend API Key & Webhook Secret',
        category: 'Integrations',
        description: 'Manage encrypted Resend credentials and verify live provider connectivity.',
        href: '/settings/integrations/resend',
        keywords: 'resend api key secret webhook token credentials integration',
      },
      {
        id: 'media-upload-limit',
        title: 'Maximum Media Upload Size',
        category: 'Media',
        description: 'Set maximum allowable file size in megabytes for asset uploads.',
        href: '/media/settings',
        keywords: 'media upload size megabytes limit bytes image video file',
      },
      {
        id: 'media-expiry',
        title: 'Upload Session Expiration',
        category: 'Media',
        description: 'Duration before initiated upload sessions expire and invalidate.',
        href: '/media/settings',
        keywords: 'session expiry timeout upload minutes duration',
      },
      {
        id: 'storefront-url',
        title: 'Public Storefront URL',
        category: 'Storefront',
        description: 'Customer origin URL used in notification links and order trackers.',
        href: '/settings/storefront',
        keywords: 'storefront url public base domain origin link',
      },
      {
        id: 'general-timezone',
        title: 'Business Timezone & Organization Name',
        category: 'General',
        description: 'Canonical operational timezone (Asia/Dhaka) and primary company profile.',
        href: '/settings/general',
        keywords: 'timezone time dhaka store name organization profile general',
      },
      {
        id: 'inventory-threshold',
        title: 'Low Stock Alert Threshold',
        category: 'General',
        description: 'Inventory quantity at or below which variants trigger low stock warnings.',
        href: '/settings/general',
        keywords: 'low stock threshold inventory alert warning units',
      },
      {
        id: 'security-session',
        title: 'Operator Session Timeout',
        category: 'Security',
        description: 'Inactivity duration before administrative sessions require re-authentication.',
        href: '/settings/security',
        keywords: 'security session timeout idle minutes inactivity logout',
      },
      {
        id: 'design-system',
        title: 'Design System & UI Lab',
        category: 'Interface',
        description: 'Inspect semantic tokens, typography scales, buttons, tables, and UI primitives.',
        href: '/settings/design-system',
        keywords: 'design system ui tokens colors buttons components lab showcase typography',
      },
    ];
    return list;
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return searchableIndex.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q),
    );
  }, [searchQuery, searchableIndex]);

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      <SettingsNav />

      {/* Header with Search Input */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings Overview</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Centralized configuration control center across business modules, integrations, and operational rules.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search all settings & keys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs h-9"
          />
        </div>
      </div>

      {/* Search Results Display */}
      {searchQuery.trim() && (
        <div className="p-4 rounded-xl border border-primary/30 bg-card shadow-md space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Search Results for &ldquo;{searchQuery}&rdquo; ({searchResults.length})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="text-xs h-6 px-2"
            >
              Clear
            </Button>
          </div>

          {searchResults.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              No configuration settings found matching your query.
            </p>
          ) : (
            <div className="divide-y text-xs">
              {searchResults.map((item) => (
                <div
                  key={item.id}
                  className="py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 px-2 rounded-lg transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{item.title}</span>
                      <Badge variant="outline" className="text-[10px] font-mono py-0">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{item.description}</p>
                  </div>
                  <Link
                    href={item.href}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-7 shrink-0 gap-1' })}
                  >
                    Configure
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuration Health Summary Banner */}
      <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
            <HeartPulse className="size-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Configuration Health</h2>
              <SettingStatusBadge status={healthData?.overallStatus ?? 'HEALTHY'} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {healthData?.overallStatus === 'HEALTHY'
                ? 'All transactional providers, storage buckets, and sender domains are configured normally.'
                : '1 or more configuration items require attention to ensure continuous deliverability.'}
            </p>
          </div>
        </div>

        <Link
          href="/settings/health"
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 shrink-0 gap-1.5' })}
        >
          Open Health Audit
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* Category Control Cards */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Configuration Control Center
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/settings/general"
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all space-y-2 group shadow-2xs"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
              <SlidersHorizontal className="size-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                General
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Organization profile, timezone, low stock alert rules, and default currency.
              </p>
            </div>
          </Link>

          <Link
            href="/settings/organization"
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all space-y-2 group shadow-2xs"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 group-hover:scale-105 transition-transform">
              <Building2 className="size-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Organization
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Legal entity details, business registration, addresses, and tax numbers.
              </p>
            </div>
          </Link>

          <Link
            href="/settings/security"
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all space-y-2 group shadow-2xs"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 group-hover:scale-105 transition-transform">
              <Shield className="size-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Security & Access
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Session lifetime policies, password safeguards, and role permissions.
              </p>
            </div>
          </Link>

          <Link
            href="/settings/integrations"
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all space-y-2 group shadow-2xs"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 group-hover:scale-105 transition-transform">
              <Plug className="size-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Integrations
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Resend email delivery, Pathao courier, Cloudflare R2, and payment gateways.
              </p>
            </div>
          </Link>

          <Link
            href="/settings/design-system"
            className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all space-y-2 group shadow-2xs"
          >
            <div className="flex size-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 group-hover:scale-105 transition-transform">
              <Sparkles className="size-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                Design System
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Visual tokens, typography scale, buttons, tables, and operational UI lab.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Module-Owned Settings Live Cards */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Module-Owned Configuration
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Settings live with the modules that own operational behavior
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Email Module Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Email Notifications</span>
                </div>
                <SettingStatusBadge status="ready" label="Ready" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Transactional order dispatches, Resend credentials, sender identity, and testing overrides.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Provider: <strong className="text-foreground">Resend</strong></div>
                <div>Transactional Email: <strong className="text-emerald-600">Enabled</strong></div>
              </div>
            </div>
            <Link
              href="/email?tab=settings"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Open Email Settings
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Media Module Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Media & Uploads</span>
                </div>
                <SettingStatusBadge status="ready" label="Ready" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Maximum file upload size, upload session duration, and Cloudflare R2 bucket connectivity.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Max Upload: <strong className="text-foreground">10 MB</strong></div>
                <div>Storage: <strong className="text-foreground">Cloudflare R2</strong></div>
              </div>
            </div>
            <Link
              href="/media/settings"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Open Media Settings
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Storefront Module Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Store className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Storefront Branding</span>
                </div>
                <SettingStatusBadge status="ready" label="Configured" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Public storefront URL, brand identity, customer helpline, and cross-module link origins.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Public URL: <strong className="text-foreground">maevelle.com</strong></div>
                <div>Helpline: <strong className="text-foreground">+8801700000000</strong></div>
              </div>
            </div>
            <Link
              href="/settings/storefront"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Open Storefront Settings
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Delivery & Logistics Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Delivery & Couriers</span>
                </div>
                <SettingStatusBadge status="CONNECTED" label="Connected" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pathao courier integration, automated consignment booking, tracking, and delivery zones.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Primary Courier: <strong className="text-foreground">Pathao</strong></div>
                <div>Webhook Ingestion: <strong className="text-emerald-600">Active</strong></div>
              </div>
            </div>
            <Link
              href="/delivery/couriers"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Configure Couriers
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Inventory Policies Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Boxes className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Inventory Policies</span>
                </div>
                <SettingStatusBadge status="ready" label="Configured" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Low stock alarm thresholds, stock reservation expiration, and warehouse allocation rules.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Low Stock Alarm: <strong className="text-foreground">5 units</strong></div>
                <div>Reservation Hold: <strong className="text-foreground">15 mins</strong></div>
              </div>
            </div>
            <Link
              href="/inventory"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Open Inventory
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Payments & Finance Card */}
          <div className="p-4 rounded-xl border border-border bg-card flex flex-col justify-between space-y-3 shadow-xs">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Payments & Accounts</span>
                </div>
                <SettingStatusBadge status="ready" label="Configured" />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Payment collection channels, merchant accounts, manual verification, and COD settlements.
              </p>
              <div className="pt-2 border-t text-[11px] text-muted-foreground space-y-0.5 font-mono">
                <div>Gateways: <strong className="text-foreground">bKash, Nagad, COD</strong></div>
                <div>Currency: <strong className="text-foreground">BDT (৳)</strong></div>
              </div>
            </div>
            <Link
              href="/payments"
              className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5' })}
            >
              Open Payments
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
