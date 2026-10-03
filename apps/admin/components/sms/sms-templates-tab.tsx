'use client';

import { useEffect, useState } from 'react';
import { Columns2, Eye, RefreshCw, Smartphone } from 'lucide-react';
import type { SmsPolicyDto, SmsPreviewDto, SmsTemplateDto } from './sms-types';
import { formatBangladeshPhone, smsEventLabel } from './sms-types';
import { SmsMessagePreview } from './sms-message-preview';
import { fetchSmsApi } from './sms-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

const fixtures = {
  SIMPLE_COD: {
    label: 'Simple COD Order',
    description: 'Typical short order reference and total.',
    orderNumber: 'MV10248',
    totalAmount: '680.00',
    phone: '01712345678',
    customerName: 'Fahim',
  },
  MULTI_ITEM: {
    label: 'Multi-Item Order',
    description: 'Multi-item basket with standard total.',
    orderNumber: 'MV-MI-40192',
    totalAmount: '3,450.00',
    phone: '01712345678',
    customerName: 'Tanvir',
  },
  DISCOUNTED: {
    label: 'Discounted Order',
    description: 'Longer reference and discounted total.',
    orderNumber: 'MV-DISC-20481',
    totalAmount: '1,249.00',
    phone: '01812345678',
    customerName: 'Nusrat',
  },
  LONG_TRACKING: {
    label: 'Long Tracking Link',
    description: 'Tests longer tracking URL parameters near segment boundary.',
    orderNumber: 'MV-TRK-88291',
    totalAmount: '2,890.00',
    phone: '01912345678',
    customerName: 'Kamal',
    trackingUrl: 'https://shop.maevelle.test/orders/track?order=MV-TRK-88291&sig=c927f8a109b7c84',
  },
  BANGLA_NAME: {
    label: 'Bangla Customer Name',
    description: 'Unicode customer name requiring 70/67 character segments.',
    orderNumber: 'MV10248',
    totalAmount: '680.00',
    phone: '01712345678',
    customerName: 'আশরাফী রহমান',
  },
} as const;

export function SmsTemplatesTab({
  templates,
  policies,
}: {
  readonly templates: readonly SmsTemplateDto[];
  readonly policies: readonly SmsPolicyDto[];
}) {
  const [selectedEvent, setSelectedEvent] = useState(templates[0]?.event ?? 'ORDER_CONFIRMED');
  const [fixtureKey, setFixtureKey] = useState<keyof typeof fixtures>('SIMPLE_COD');
  const [orderId, setOrderId] = useState('');
  const [preview, setPreview] = useState<SmsPreviewDto>();
  const [comparisons, setComparisons] = useState<
    ReadonlyArray<{ key: keyof typeof fixtures; label: string; preview: SmsPreviewDto }>
  >([]);
  const [showComparison, setShowComparison] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const selected = templates.find((template) => template.event === selectedEvent);
  const policy = policies.find((item) => item.notification_type === selectedEvent);

  const renderPreview = async (useOrder = false) => {
    setLoading(true);
    setError('');
    try {
      const fixture = fixtures[fixtureKey];
      setPreview(
        await fetchSmsApi<SmsPreviewDto>(`/admin/sms/templates/${selectedEvent}/preview`, {
          method: 'POST',
          body: JSON.stringify(useOrder ? { orderId: orderId.trim() } : fixture),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'SMS preview could not be rendered.');
    } finally {
      setLoading(false);
    }
  };

  const loadComparison = async () => {
    setComparing(true);
    setError('');
    try {
      const results = await Promise.all(
        (Object.keys(fixtures) as Array<keyof typeof fixtures>).map(async (key) => {
          const res = await fetchSmsApi<SmsPreviewDto>(
            `/admin/sms/templates/${selectedEvent}/preview`,
            {
              method: 'POST',
              body: JSON.stringify(fixtures[key]),
            },
          );
          return { key, label: fixtures[key].label, preview: res };
        }),
      );
      setComparisons(results);
      setShowComparison(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to compare fixtures.');
    } finally {
      setComparing(false);
    }
  };

  useEffect(() => {
    if (templates.length) void renderPreview(false);
  }, [selectedEvent, fixtureKey, templates.length]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>Transactional SMS Templates</CardTitle>
          <CardDescription>
            Version-controlled, approved business-event messages. Previewing never creates or sends
            a notification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {templates.map((template) => {
            const templatePolicy = policies.find(
              (item) => item.notification_type === template.event,
            );
            const active = template.event === selectedEvent;
            return (
              <button
                type="button"
                key={template.key}
                onClick={() => setSelectedEvent(template.event)}
                className={`w-full rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-ring ${active ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{smsEventLabel(template.event)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                  </div>
                  <Badge variant="outline">v{template.version}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                  <Badge variant={templatePolicy?.enabled ? 'default' : 'secondary'}>
                    {templatePolicy?.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                  <Badge variant="outline">
                    {templatePolicy?.automatic_enabled ? 'Automatic' : 'Manual Only'}
                  </Badge>
                  <Badge variant="outline">
                    {templatePolicy?.manual_allowed ? 'Manual Allowed' : 'No Manual Send'}
                  </Badge>
                </div>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">{template.key}</p>
              </button>
            );
          })}
        </CardContent>
      </Card>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone aria-hidden="true" className="size-5" />
              Preview Controls
            </CardTitle>
            <CardDescription>
              Render a safe fixture or a real order snapshot through the authoritative backend
              template service.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sms-preview-template">Template</Label>
                <NativeSelect
                  id="sms-preview-template"
                  value={selectedEvent}
                  onChange={(event) => setSelectedEvent(event.target.value)}
                >
                  {templates.map((template) => (
                    <NativeSelectOption key={template.event} value={template.event}>
                      {smsEventLabel(template.event)}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sms-preview-fixture">Fixture</Label>
                <NativeSelect
                  id="sms-preview-fixture"
                  value={fixtureKey}
                  onChange={(event) => setFixtureKey(event.target.value as keyof typeof fixtures)}
                >
                  {Object.entries(fixtures).map(([key, fixture]) => (
                    <NativeSelectOption key={key} value={key}>
                      {fixture.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p className="text-[11px] text-muted-foreground">
                  {fixtures[fixtureKey].description}
                </p>
              </div>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <Label htmlFor="sms-preview-order">Preview Using an Existing Order</Label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input
                  id="sms-preview-order"
                  name="sms-preview-order"
                  autoComplete="off"
                  value={orderId}
                  onChange={(event) => setOrderId(event.target.value)}
                  placeholder="Order number or UUID…"
                />
                <Button
                  variant="outline"
                  disabled={!orderId.trim() || loading}
                  onClick={() => void renderPreview(true)}
                >
                  <Eye aria-hidden="true" className="mr-1.5 size-4" />
                  Preview Order
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                The order snapshot supplies the recipient and message data. This action has zero
                send side effects.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadComparison()}
                disabled={comparing || loading}
              >
                <Columns2 aria-hidden="true" className="mr-1.5 size-3.5" />
                {comparing ? 'Comparing Fixtures…' : 'Compare All Fixtures'}
              </Button>
              {showComparison ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowComparison(false)}
                  className="text-xs text-muted-foreground"
                >
                  Hide Comparison Matrix
                </Button>
              ) : null}
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>
        {showComparison && comparisons.length ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Fixture Comparison Matrix</CardTitle>
                  <CardDescription>
                    Comparing segment counts and encoding requirements across customer scenarios for{' '}
                    {selected ? smsEventLabel(selected.event) : 'this template'}.
                  </CardDescription>
                </div>
                <Badge variant="outline">{comparisons.length} fixtures evaluated</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="divide-y rounded-xl border">
                {comparisons.map((item) => (
                  <div key={item.key} className="p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-medium">{item.label}</strong>
                        <Badge
                          variant={item.preview.encoding === 'UNICODE' ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {item.preview.encoding === 'UNICODE' ? 'Unicode' : 'GSM-7'}
                        </Badge>
                      </div>
                      <Badge
                        variant={item.preview.segmentCount > 1 ? 'default' : 'outline'}
                        className="tabular-nums text-xs"
                      >
                        {item.preview.segmentCount}{' '}
                        {item.preview.segmentCount === 1 ? 'segment' : 'segments'}
                      </Badge>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-2.5 text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {item.preview.renderedText}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {item.preview.characterCount} characters ({item.preview.encodingUnitCount}{' '}
                        units)
                      </span>
                      {item.preview.warnings[0] ? (
                        <span className="text-amber-700 dark:text-amber-300 font-medium">
                          {item.preview.warnings[0]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>
                  {selected ? smsEventLabel(selected.event) : 'Message Preview'}
                </CardTitle>
                <CardDescription>
                  {selected?.key} · v{selected?.version} ·{' '}
                  {policy?.automatic_enabled ? 'Automatic enabled' : 'Automatic disabled'}
                </CardDescription>
              </div>
              {loading ? (
                <RefreshCw
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {preview ? (
              <>
                <SmsMessagePreview text={preview.renderedText} analysis={preview} previewOnly />
                <div className="mt-4 grid gap-3 rounded-xl border p-4 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Intended Recipient</p>
                    <p className="font-medium">
                      {formatBangladeshPhone(preview.intendedRecipient)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Normalized</p>
                    <p className="font-mono">
                      {preview.normalizedRecipient ?? 'Invalid or missing'}
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Choose a template to render a preview.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
