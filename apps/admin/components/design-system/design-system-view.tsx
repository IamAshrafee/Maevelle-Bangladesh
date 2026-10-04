'use client';

import { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Filter,
  Info,
  Layers,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageActions,
  PageDescription,
  PageHeader,
  PagePanel,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';

export function DesignSystemView({ hideHeader }: { hideHeader?: boolean } = {}) {
  const [isDark, setIsDark] = useState(false);
  const [activeTab, setActiveTab] = useState<'tokens' | 'typography' | 'buttons' | 'forms' | 'tables' | 'surfaces'>('tokens');

  const toggleDarkMode = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <AdminPage>
      <PageHeader>
        <div>
          <p className="eyebrow">Design System & Architecture</p>
          <PageTitle>Maevelle Visual System Lab</PageTitle>
          <PageDescription>
            Authoritative operational UI primitives, semantic tokens, and interaction guidelines for Maevelle Admin.
          </PageDescription>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" onClick={toggleDarkMode} className="gap-2">
            {isDark ? <Sun className="size-4 text-amber-500" /> : <Moon className="size-4 text-slate-700" />}
            <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
          </Button>
        </PageActions>
      </PageHeader>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-px overflow-x-auto">
        {[
          { id: 'tokens', label: 'Semantic Tokens' },
          { id: 'typography', label: 'Typography' },
          { id: 'buttons', label: 'Buttons & Controls' },
          { id: 'forms', label: 'Form Elements' },
          { id: 'tables', label: 'Data Tables' },
          { id: 'surfaces', label: 'Surfaces & Elevation' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. SEMANTIC TOKENS */}
      {activeTab === 'tokens' ? (
        <div className="space-y-8">
          <PageSection
            title="Brand Primary Palette"
            description="Maevelle Electric Teal (#0d9488) serves as the primary action and brand anchor."
          >
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="h-12 rounded bg-primary flex items-center justify-center text-primary-foreground font-semibold text-xs shadow-2xs">
                  #0d9488
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">--primary</div>
                  <div className="text-muted-foreground">Main action brand</div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="h-12 rounded bg-primary-hover flex items-center justify-center text-white font-semibold text-xs shadow-2xs">
                  #0f766e
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">--primary-hover</div>
                  <div className="text-muted-foreground">Hover state</div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="h-12 rounded bg-primary-active flex items-center justify-center text-white font-semibold text-xs shadow-2xs">
                  #115e59
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">--primary-active</div>
                  <div className="text-muted-foreground">Active / pressed</div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="h-12 rounded bg-primary-subtle border border-primary/20 flex items-center justify-center text-primary font-semibold text-xs">
                  10% Alpha
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">--primary-subtle</div>
                  <div className="text-muted-foreground">Tints & badges</div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-3 space-y-2 bg-card">
                <div className="h-12 rounded bg-ring flex items-center justify-center text-white font-semibold text-xs ring-4 ring-primary/20">
                  Focus Ring
                </div>
                <div className="text-xs">
                  <div className="font-medium text-foreground">--ring</div>
                  <div className="text-muted-foreground">Keyboard outline</div>
                </div>
              </div>
            </div>
          </PageSection>

          <PageSection
            title="Semantic Business States"
            description="Dedicated status colors that are strictly separated from brand styling."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Success */}
              <div className="rounded-lg border border-success/30 bg-success-subtle p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-success uppercase tracking-wider">Success</span>
                  <StatusBadge status="ACTIVE" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Committed, verified, completed, or authorized operational state.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground">--color-success: #16a34a</div>
              </div>

              {/* Warning */}
              <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-warning uppercase tracking-wider">Warning</span>
                  <StatusBadge status="PENDING" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Action required, pending verification, stock running low, or review necessary.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground">--color-warning: #d97706</div>
              </div>

              {/* Destructive */}
              <div className="rounded-lg border border-destructive/30 bg-destructive-subtle p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider">Destructive</span>
                  <StatusBadge status="FAILED" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Failed operation, error, cancellation, fraud alert, or destructive deletion.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground">--color-destructive: #dc2626</div>
              </div>

              {/* Info */}
              <div className="rounded-lg border border-info/30 bg-info-subtle p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-info uppercase tracking-wider">Info / Neutral</span>
                  <StatusBadge status="INFO" />
                </div>
                <p className="text-xs text-muted-foreground">
                  General telemetry, queued items, information notice, or neutral state.
                </p>
                <div className="text-[11px] font-mono text-muted-foreground">--color-info: #2563eb</div>
              </div>
            </div>
          </PageSection>

          <PageSection
            title="Data Visualization Palette"
            description="Cohesive chart colors tuned for accessibility and legibility."
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { name: '--chart-1', hex: '#0d9488', label: 'Primary Trend' },
                { name: '--chart-2', hex: '#0284c7', label: 'Secondary Volume' },
                { name: '--chart-3', hex: '#6366f1', label: 'Comparison Set' },
                { name: '--chart-4', hex: '#f59e0b', label: 'Forecast / Pipeline' },
                { name: '--chart-5', hex: '#10b981', label: 'Completed Growth' },
              ].map((c) => (
                <div key={c.name} className="rounded-lg border border-border p-3 space-y-2 bg-card">
                  <div
                    className="h-10 rounded shadow-2xs flex items-center justify-center text-white text-xs font-semibold"
                    style={{ backgroundColor: c.hex }}
                  >
                    {c.hex}
                  </div>
                  <div className="text-xs">
                    <div className="font-medium text-foreground">{c.name}</div>
                    <div className="text-muted-foreground">{c.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </PageSection>
        </div>
      ) : null}

      {/* 2. TYPOGRAPHY */}
      {activeTab === 'typography' ? (
        <div className="space-y-6">
          <PagePanel className="divide-y divide-border">
            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Page Title <br />
                <span className="text-[11px]">28px / 34px · Bold (700)</span>
              </div>
              <div className="text-2xl sm:text-[28px] leading-tight font-bold text-foreground">
                Orders & Fulfillment Operations
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Major Section <br />
                <span className="text-[11px]">20px / 28px · SemiBold (600)</span>
              </div>
              <div className="text-xl leading-snug font-semibold text-foreground">
                Warehouse Stock Movement & Dispatches
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Card / Section <br />
                <span className="text-[11px]">16px / 24px · SemiBold (600)</span>
              </div>
              <div className="text-base font-semibold text-foreground">
                Delivery Courier Tracking & Reconciliation
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Body Text <br />
                <span className="text-[11px]">14px / 21px · Regular (400)</span>
              </div>
              <div className="text-sm text-foreground/90 max-w-xl leading-relaxed">
                Cart and checkout reservation steps never consume physical stock. Dispatch is the authoritative physical movement that triggers ledger deductions and cost allocation.
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Form Label <br />
                <span className="text-[11px]">13px / 18px · Medium (500)</span>
              </div>
              <div className="text-[13px] font-medium text-muted-foreground">
                Primary Shipping Warehouse Address
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Numeric / Tabular <br />
                <span className="text-[11px]">13px · tabular-nums</span>
              </div>
              <div className="font-mono text-sm tabular-nums text-foreground">
                ৳ 2,450.00 &nbsp;|&nbsp; 14,290 units &nbsp;|&nbsp; ORD-2026-9481
              </div>
            </div>

            <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div className="w-48 shrink-0 text-xs font-mono text-muted-foreground">
                Metadata / Eyebrow <br />
                <span className="text-[11px]">12px · Uppercase (600)</span>
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operations / Warehouse / Inventory
              </div>
            </div>
          </PagePanel>
        </div>
      ) : null}

      {/* 3. BUTTONS & CONTROLS */}
      {activeTab === 'buttons' ? (
        <div className="space-y-6">
          <PageSection title="Button Variants" description="Consistent hierarchy for primary, secondary, and destructive actions.">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="default">Primary Action</Button>
              <Button variant="secondary">Secondary Action</Button>
              <Button variant="outline">Outline Action</Button>
              <Button variant="ghost">Ghost Action</Button>
              <Button variant="destructive">Destructive Action</Button>
              <Button variant="link">Link Button</Button>
              <Button variant="glass">Glass Button</Button>
            </div>
          </PageSection>

          <PageSection title="Button Sizes" description="Standardized control heights (sm: 32px, default: 36px, lg: 40px).">
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small (32px)</Button>
              <Button size="default">Default (36px)</Button>
              <Button size="lg">Large (40px)</Button>
              <Button size="icon"><Sparkles className="size-4" /></Button>
              <Button size="icon-sm"><Sparkles className="size-3.5" /></Button>
            </div>
          </PageSection>

          <PageSection title="Button States" description="Interactive states: loading, disabled, with icon.">
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled>Disabled State</Button>
              <Button disabled variant="outline">
                <RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Loading
              </Button>
              <Button className="gap-2">
                <Plus className="size-4" /> Add Product
              </Button>
              <Button variant="outline" className="gap-2">
                <Download className="size-4" /> Export CSV
              </Button>
            </div>
          </PageSection>

          <PageSection title="Status Badges" description="Rebuilt with pure Tailwind semantic tokens.">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status="ACTIVE" />
              <StatusBadge status="PENDING" />
              <StatusBadge status="FAILED" />
              <StatusBadge status="READY" />
              <StatusBadge status="DISPATCHED" />
              <StatusBadge status="REFUNDED" />
              <StatusBadge status="CANCELLED" />
            </div>
          </PageSection>
        </div>
      ) : null}

      {/* 4. FORM ELEMENTS */}
      {activeTab === 'forms' ? (
        <div className="space-y-6">
          <PagePanel className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Product Title <span className="text-destructive">*</span>
                </label>
                <Input placeholder="e.g. Silk Jamdani Saree" defaultValue="Maevelle Signature Saree" />
                <p className="text-[11px] text-muted-foreground">The public Storefront display title.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Warehouse Location
                </label>
                <NativeSelect defaultValue="dhk-1">
                  <option value="dhk-1">Dhaka Central Hub (DHK-01)</option>
                  <option value="ctg-1">Chittagong Port Facility (CTG-01)</option>
                  <option value="syl-1">Sylhet Regional Depot (SYL-01)</option>
                </NativeSelect>
                <p className="text-[11px] text-muted-foreground">Location owning inventory dispatch.</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground block">
                  Search Query
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input placeholder="Search SKU, order or customer…" className="pl-8" />
                </div>
                <p className="text-[11px] text-muted-foreground">Global real-time lookup.</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Order Notes / Fulfillment Guidance
              </label>
              <Textarea
                placeholder="Operational notes visible to warehouse packaging staff…"
                rows={3}
                defaultValue="Fragile handcrafted item. Include Maevelle branded thank-you card and premium dustbag."
              />
            </div>
          </PagePanel>
        </div>
      ) : null}

      {/* 5. DATA TABLES */}
      {activeTab === 'tables' ? (
        <div className="space-y-6">
          <PageSection title="Operational Data Table" description="Optimized with tabular-nums, hover states, and density support.">
            <PagePanel className="overflow-hidden">
              <Table density="comfortable">
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Total (BDT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { id: 'ORD-2026-9041', name: 'Tanvir Hossain', channel: 'Online Store', lines: 3, total: '৳ 12,450', status: 'PAID' },
                    { id: 'ORD-2026-9042', name: 'Nusrat Jahan', channel: 'Instagram Direct', lines: 1, total: '৳ 3,200', status: 'PENDING' },
                    { id: 'ORD-2026-9043', name: 'Farhan Ahmed', channel: 'POS Showroom', lines: 5, total: '৳ 28,900', status: 'DISPATCHED' },
                    { id: 'ORD-2026-9044', name: 'Sabrina Rahman', channel: 'Online Store', lines: 2, total: '৳ 6,800', status: 'CANCELLED' },
                  ].map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-foreground font-mono">{row.id}</TableCell>
                      <TableCell>{row.name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.lines}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                      <TableCell><StatusBadge status={row.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                          Inspect
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </PagePanel>
          </PageSection>
        </div>
      ) : null}

      {/* 6. SURFACES & ELEVATION */}
      {activeTab === 'surfaces' ? (
        <div className="space-y-6">
          <PageSection title="Three-Tier Elevation Hierarchy" description="Restrained, border-first elevation designed for long operational sessions.">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Flat */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Level 1: Flat</div>
                <h3 className="text-base font-semibold text-foreground">Standard Border Surface</h3>
                <p className="text-xs text-muted-foreground">
                  Used for tables, data panels, forms, and general content cards. No heavy shadow, high focus on content.
                </p>
                <div className="pt-2 text-[11px] font-mono text-muted-foreground">border border-border bg-card</div>
              </div>

              {/* Raised */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-2 shadow-2xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">Level 2: Raised</div>
                <h3 className="text-base font-semibold text-foreground">Interactive Raised Card</h3>
                <p className="text-xs text-muted-foreground">
                  Used for key metric cards, active hover cards, and sticky chrome elements.
                </p>
                <div className="pt-2 text-[11px] font-mono text-muted-foreground">shadow-2xs border border-border</div>
              </div>

              {/* Floating */}
              <div className="rounded-lg border border-border bg-card p-5 space-y-2 shadow-lg">
                <div className="text-xs font-semibold uppercase tracking-wider text-info">Level 3: Floating</div>
                <h3 className="text-base font-semibold text-foreground">Overlay & Dialog Surface</h3>
                <p className="text-xs text-muted-foreground">
                  Used for command palette, modal dialogs, flyout menus, and floating inspection drawers.
                </p>
                <div className="pt-2 text-[11px] font-mono text-muted-foreground">shadow-lg border border-border</div>
              </div>
            </div>
          </PageSection>

          <PageSection title="Restrained Liquid Glass" description="Used exclusively for sticky chrome, topbars, and search modals.">
            <div className="p-8 rounded-xl bg-gradient-to-r from-teal-500/10 via-sky-500/10 to-emerald-500/10 border border-border flex items-center justify-center">
              <div className="p-6 rounded-xl border border-border/80 bg-background/80 backdrop-blur-md shadow-md max-w-md text-center space-y-2">
                <Sparkles className="size-6 text-primary mx-auto" />
                <h4 className="text-sm font-semibold text-foreground">Translucent Frosted Glass</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Only applied to floating and sticky navigation chrome where the background content softly shines through without sacrificing readability.
                </p>
              </div>
            </div>
          </PageSection>
        </div>
      ) : null}
    </AdminPage>
  );
}
