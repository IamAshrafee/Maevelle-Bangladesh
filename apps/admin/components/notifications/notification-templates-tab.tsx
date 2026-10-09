'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Code2,
  ExternalLink,
  Eye,
  FileCode,
  Layers,
  LayoutTemplate,
  Loader2,
  Mail,
  MessageSquare,
  Monitor,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { NotificationChannelBadge } from './notification-status-badge';

interface StandardTemplateItem {
  readonly notificationType: string;
  readonly name: string;
  readonly channel: 'EMAIL' | 'SMS' | 'IN_APP';
  readonly domain: string;
  readonly description: string;
  readonly variableKeys: readonly string[];
}

// Built-in verified system templates
const standardTemplates: readonly StandardTemplateItem[] = [
  {
    notificationType: 'ORDER_PLACED',
    name: 'Order Placement Confirmation',
    channel: 'EMAIL',
    domain: 'Orders',
    description: 'Sent immediately to the customer after order placement with item summary and pricing.',
    variableKeys: ['orderNumber', 'customerName', 'totalAmount', 'items', 'orderUrl'],
  },
  {
    notificationType: 'ORDER_CONFIRMED',
    name: 'Order Confirmed',
    channel: 'EMAIL',
    domain: 'Orders',
    description: 'Notifies customer when merchant accepts the order and allocates stock.',
    variableKeys: ['orderNumber', 'customerName', 'totalAmount', 'orderUrl'],
  },
  {
    notificationType: 'ORDER_CONFIRMED',
    name: 'Order Confirmed SMS',
    channel: 'SMS',
    domain: 'Orders',
    description: 'Concise SMS dispatch confirming order number and cash on delivery or payment status.',
    variableKeys: ['orderNumber', 'totalAmount'],
  },
  {
    notificationType: 'ORDER_DISPATCHED',
    name: 'Order Dispatched / In Transit',
    channel: 'EMAIL',
    domain: 'Fulfillment',
    description: 'Contains courier consignment number and tracking link for parcel delivery.',
    variableKeys: ['orderNumber', 'trackingNumber', 'courierName', 'trackingUrl'],
  },
  {
    notificationType: 'ORDER_DISPATCHED',
    name: 'Order Dispatched SMS',
    channel: 'SMS',
    domain: 'Fulfillment',
    description: 'Quick SMS with tracking URL so customer can track rider progress.',
    variableKeys: ['orderNumber', 'trackingUrl'],
  },
  {
    notificationType: 'DELIVERY_COMPLETED',
    name: 'Delivery Confirmed',
    channel: 'EMAIL',
    domain: 'Fulfillment',
    description: 'Confirmation email sent when courier marks parcel as delivered.',
    variableKeys: ['orderNumber', 'deliveredAt', 'customerName'],
  },
  {
    notificationType: 'DELIVERY_COMPLETED',
    name: 'Delivery Confirmed SMS',
    channel: 'SMS',
    domain: 'Fulfillment',
    description: 'Brief delivery confirmation SMS to recipient mobile.',
    variableKeys: ['orderNumber'],
  },
  {
    notificationType: 'PAYMENT_VERIFIED',
    name: 'Payment Verified',
    channel: 'EMAIL',
    domain: 'Payments',
    description: 'Sent upon successful verification of bKash/Nagad/card transaction proof.',
    variableKeys: ['orderNumber', 'transactionId', 'amountPaid', 'paymentMethod'],
  },
  {
    notificationType: 'REFUND_COMPLETED',
    name: 'Refund Dispatched',
    channel: 'EMAIL',
    domain: 'Payments',
    description: 'Alerts customer of completed refund payment with transaction reference.',
    variableKeys: ['orderNumber', 'refundAmount', 'reversalReference'],
  },
  {
    notificationType: 'RETURN_AUTHORIZED',
    name: 'Return Request Authorized',
    channel: 'EMAIL',
    domain: 'Returns',
    description: 'Provides instructions for customer return shipment and pickup timeline.',
    variableKeys: ['returnNumber', 'orderNumber', 'pickupInstructions'],
  },
  {
    notificationType: 'REVIEW_REQUEST',
    name: 'Customer Review Invitation',
    channel: 'EMAIL',
    domain: 'Reviews',
    description: 'Post-delivery email inviting customer to review purchased clothing and fit.',
    variableKeys: ['orderNumber', 'productName', 'reviewUrl'],
  },
  {
    notificationType: 'ORDER_AWAITING_REVIEW',
    name: 'Staff: New Order Awaiting Review',
    channel: 'IN_APP',
    domain: 'Operations',
    description: 'In-app notification targeting staff members with orders.view capability.',
    variableKeys: ['orderNumber', 'orderAmount', 'actionPath'],
  },
  {
    notificationType: 'PAYMENT_REVIEW_REQUIRED',
    name: 'Staff: Payment Verification Needed',
    channel: 'IN_APP',
    domain: 'Operations',
    description: 'In-app notification targeting staff members authorized to verify payments.',
    variableKeys: ['orderNumber', 'amount', 'actionPath'],
  },
  {
    notificationType: 'DELIVERY_EXCEPTION_REQUIRES_ATTENTION',
    name: 'Staff: Delivery Exception Alert',
    channel: 'IN_APP',
    domain: 'Operations',
    description: 'In-app operational alert when courier reports a failed delivery attempt.',
    variableKeys: ['deliveryId', 'consignmentId', 'failureReason', 'actionPath'],
  },
];

export function NotificationTemplatesTab() {
  const [channelFilter, setChannelFilter] = useState<string>('ALL');
  const [domainFilter, setDomainFilter] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');

  // Template preview state
  const [previewTemplate, setPreviewTemplate] = useState<StandardTemplateItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string | null>(null);
  const [previewSmsText, setPreviewSmsText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Custom template creation
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('ORDER_CONFIRMED');
  const [templateChannel, setTemplateChannel] = useState<'EMAIL' | 'SMS' | 'IN_APP'>('EMAIL');
  const [creating, setCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const domains = React.useMemo(() => {
    return Array.from(new Set(standardTemplates.map((t) => t.domain)));
  }, []);

  const filteredTemplates = React.useMemo(() => {
    return standardTemplates.filter((t) => {
      const matchChannel = channelFilter === 'ALL' || t.channel === channelFilter;
      const matchDomain = domainFilter === 'ALL' || t.domain === domainFilter;
      const term = search.trim().toLowerCase();
      const matchSearch =
        !term ||
        t.name.toLowerCase().includes(term) ||
        t.notificationType.toLowerCase().includes(term) ||
        t.description.toLowerCase().includes(term);
      return matchChannel && matchDomain && matchSearch;
    });
  }, [channelFilter, domainFilter, search]);

  const loadPreview = async (template: StandardTemplateItem) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewHtml(null);
    setPreviewSubject(null);
    setPreviewSmsText(null);

    try {
      if (template.channel === 'EMAIL') {
        const res = await apiRequest<{
          data: { subject: string; html: string; text?: string };
        }>(`/admin/email/templates/${template.notificationType}/preview`, {
          method: 'POST',
          body: JSON.stringify({ fixtureKey: 'DEFAULT' }),
        });
        setPreviewSubject(res.data.subject);
        setPreviewHtml(res.data.html);
      } else if (template.channel === 'SMS') {
        const res = await apiRequest<{
          data: { renderedBody: string; characterCount?: number };
        }>(`/admin/sms/templates/${template.notificationType}/preview`, {
          method: 'POST',
          body: JSON.stringify({
            orderNumber: 'MV-88219',
            totalAmount: '৳4,250',
            trackingUrl: 'https://maevelle.com.bd/orders/track/MV-88219',
          }),
        });
        setPreviewSmsText(res.data.renderedBody);
      } else {
        // In-app mock preview
        setPreviewSubject(`Staff Alert: ${template.name}`);
        setPreviewSmsText(template.description);
      }
    } catch {
      // Fallback preview
      setPreviewSubject(template.name);
      setPreviewSmsText(template.description);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) return;
    setCreating(true);
    try {
      await apiRequest('/admin/notifications/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.trim(),
          notificationType: templateType,
          channel: templateChannel,
        }),
      });
      setCreateSuccess(`Template "${templateName}" created in organization repository.`);
      setCreateDialogOpen(false);
      setTemplateName('');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not create template.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {createSuccess && (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs flex items-center justify-between">
          <span>{createSuccess}</span>
          <button
            type="button"
            onClick={() => setCreateSuccess(null)}
            className="text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-lg border border-border bg-card shadow-2xs">
        <div className="flex flex-wrap items-center gap-2">
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
                  {d}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Channel Filter */}
          <div className="w-32">
            <NativeSelect
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="h-8 text-xs bg-card"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="SMS">SMS</option>
              <option value="IN_APP">In-App</option>
            </NativeSelect>
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs bg-card"
            />
          </div>

          <Button
            size="sm"
            onClick={() => setCreateDialogOpen(true)}
            className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-medium shrink-0"
          >
            <Plus className="size-3.5 mr-1" /> New Template
          </Button>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
          <div
            key={`${template.notificationType}-${template.channel}`}
            className="rounded-lg border border-border bg-card p-4 space-y-3 hover:border-border/80 transition-colors shadow-2xs flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {template.domain}
                </span>
                <NotificationChannelBadge channel={template.channel} />
              </div>

              <h4 className="text-sm font-semibold text-foreground leading-snug">
                {template.name}
              </h4>

              <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                {template.description}
              </p>
            </div>

            <div className="space-y-3 pt-2 border-t border-border/60">
              {/* Variables preview tags */}
              <div className="flex flex-wrap gap-1">
                {template.variableKeys.slice(0, 4).map((key) => (
                  <code
                    key={key}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 border border-border/60 font-mono text-muted-foreground"
                  >
                    {`{{${key}}}`}
                  </code>
                ))}
                {template.variableKeys.length > 4 && (
                  <span className="text-[10px] text-muted-foreground font-mono self-center">
                    +{template.variableKeys.length - 4} more
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void loadPreview(template)}
                  className="h-7 text-xs border-border"
                >
                  <Eye className="size-3.5 mr-1" /> Preview
                </Button>

                {template.channel === 'EMAIL' ? (
                  <Link href="/email?tab=templates">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary-hover gap-1">
                      Email Studio <ArrowRight className="size-3" />
                    </Button>
                  </Link>
                ) : template.channel === 'SMS' ? (
                  <Link href="/sms?tab=templates">
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-primary hover:text-primary-hover gap-1">
                      SMS Studio <ArrowRight className="size-3" />
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Sheet */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-card">
          <SheetHeader className="p-4 sm:p-5 border-b border-border bg-card sticky top-0 z-10">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase font-semibold text-muted-foreground tracking-wider">
                  Template Preview
                </span>
                {previewTemplate && <NotificationChannelBadge channel={previewTemplate.channel} />}
              </div>

              {previewTemplate?.channel === 'EMAIL' && (
                <div className="flex items-center gap-1 rounded-md border border-border p-0.5 bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('desktop')}
                    className={cn(
                      'p-1 rounded text-xs transition-colors cursor-pointer',
                      previewDevice === 'desktop' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Desktop Preview"
                  >
                    <Monitor className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewDevice('mobile')}
                    className={cn(
                      'p-1 rounded text-xs transition-colors cursor-pointer',
                      previewDevice === 'mobile' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="Mobile Preview (375px)"
                  >
                    <Smartphone className="size-3.5" />
                  </button>
                </div>
              )}
            </div>

            <SheetTitle className="text-base font-semibold text-foreground pt-1">
              {previewTemplate?.name}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Event: {previewTemplate?.notificationType}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            {previewLoading ? (
              <div className="flex flex-col items-center justify-center p-16 text-muted-foreground">
                <Loader2 className="size-6 animate-spin text-primary mb-2" />
                <p className="text-xs">Rendering preview…</p>
              </div>
            ) : (
              <>
                {previewSubject && (
                  <div className="p-3 rounded-lg border border-border bg-muted/30 space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Subject Line
                    </span>
                    <p className="text-xs font-medium text-foreground">{previewSubject}</p>
                  </div>
                )}

                {/* Email HTML Sandbox or Text Preview */}
                {previewHtml ? (
                  <div className="rounded-lg border border-border overflow-hidden bg-background">
                    <div
                      className={cn(
                        'mx-auto transition-all',
                        previewDevice === 'mobile' ? 'max-w-[375px] border-x border-border/80 shadow-md my-4' : 'w-full',
                      )}
                    >
                      <iframe
                        srcDoc={previewHtml}
                        title="Email Preview"
                        sandbox="allow-same-origin"
                        className="w-full min-h-[500px] border-0 bg-white"
                      />
                    </div>
                  </div>
                ) : previewSmsText ? (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Message Body Preview
                    </span>
                    <div className="p-3 rounded bg-card border border-border text-xs text-foreground font-sans leading-relaxed whitespace-pre-wrap">
                      {previewSmsText}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-muted-foreground flex items-center justify-between pt-1">
                      <span>Length: {previewSmsText.length} characters</span>
                      <span>Estimated: ~{Math.ceil(previewSmsText.length / 160) || 1} SMS segment(s)</span>
                    </div>
                  </div>
                ) : null}

                {/* Variable Guide Panel */}
                {previewTemplate && (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Available Template Variables
                    </h5>
                    <div className="flex flex-wrap gap-1.5">
                      {previewTemplate.variableKeys.map((key) => (
                        <div
                          key={key}
                          className="px-2 py-1 rounded bg-muted/40 border border-border text-[11px] font-mono text-foreground flex items-center gap-1"
                        >
                          <span>{`{{${key}}}`}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* New Custom Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Create Custom Template</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define a new template override in your organization repository.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label htmlFor="templateName" className="text-xs">
                Template Name
              </Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Eid Campaign Confirmation"
                className="mt-1 text-xs"
              />
            </div>

            <div>
              <Label htmlFor="templateType" className="text-xs">
                Notification Event Type
              </Label>
              <NativeSelect
                id="templateType"
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                className="mt-1 text-xs bg-card"
              >
                <option value="ORDER_PLACED">ORDER_PLACED</option>
                <option value="ORDER_CONFIRMED">ORDER_CONFIRMED</option>
                <option value="ORDER_CANCELLED">ORDER_CANCELLED</option>
                <option value="PAYMENT_VERIFIED">PAYMENT_VERIFIED</option>
                <option value="ORDER_DISPATCHED">ORDER_DISPATCHED</option>
                <option value="DELIVERY_COMPLETED">DELIVERY_COMPLETED</option>
                <option value="DELIVERY_FAILED">DELIVERY_FAILED</option>
                <option value="RETURN_AUTHORIZED">RETURN_AUTHORIZED</option>
                <option value="REFUND_COMPLETED">REFUND_COMPLETED</option>
                <option value="REVIEW_REQUEST">REVIEW_REQUEST</option>
              </NativeSelect>
            </div>

            <div>
              <Label htmlFor="templateChannel" className="text-xs">
                Channel
              </Label>
              <NativeSelect
                id="templateChannel"
                value={templateChannel}
                onChange={(e) => setTemplateChannel(e.target.value as 'EMAIL' | 'SMS' | 'IN_APP')}
                className="mt-1 text-xs bg-card"
              >
                <option value="EMAIL">Email</option>
                <option value="SMS">SMS</option>
                <option value="IN_APP">In-App</option>
              </NativeSelect>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => setCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={creating || !templateName.trim()}
              onClick={handleCreateTemplate}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {creating ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
