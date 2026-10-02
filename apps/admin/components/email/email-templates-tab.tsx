'use client';

import { useState } from 'react';
import {
  FileText,
  Eye,
  Sliders,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmailPreviewFrame } from './email-preview-frame';
import {
  type EmailTemplateSummary,
  type EmailPolicyDto,
  type EmailPreviewResponse,
  templateKeyToEventMap,
  eventDisplayLabels,
  fetchEmailApi,
} from './email-types';

interface EmailTemplatesTabProps {
  readonly templates: readonly EmailTemplateSummary[];
  readonly policies: readonly EmailPolicyDto[];
}

export function EmailTemplatesTab({ templates, policies }: EmailTemplatesTabProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateSummary | null>(null);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [orderIdInput, setOrderIdInput] = useState('');
  const [activeFixtureKey, setActiveFixtureKey] = useState('multi-item');
  const [previewMode, setPreviewMode] = useState<'fixture' | 'order'>('fixture');

  const policyMap = new Map(policies.map((p) => [p.notification_type, p]));

  const openPreview = async (
    template: EmailTemplateSummary,
    overrideOrderId?: string,
    overrideFixtureKey?: string,
  ) => {
    setSelectedTemplate(template);
    setPreviewLoading(true);
    setPreviewError('');

    const eventType = templateKeyToEventMap[template.key] ?? 'ORDER_CONFIRMED';
    const targetOrderId = overrideOrderId !== undefined ? overrideOrderId : orderIdInput;
    const targetFixture = overrideFixtureKey !== undefined ? overrideFixtureKey : activeFixtureKey;

    try {
      const response = await fetchEmailApi<{ data: EmailPreviewResponse }>(
        `/admin/email/templates/${eventType}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(previewMode === 'order' && targetOrderId.trim() ? { orderId: targetOrderId.trim() } : {}),
            ...(previewMode === 'fixture' && targetFixture ? { fixtureKey: targetFixture } : {}),
          }),
        },
      );
      setPreviewData(response.data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Could not generate email preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFixtureChange = (fixtureKey: string) => {
    setActiveFixtureKey(fixtureKey);
    setPreviewMode('fixture');
    if (selectedTemplate) {
      void openPreview(selectedTemplate, '', fixtureKey);
    }
  };

  const handleOrderPreviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderIdInput.trim() || !selectedTemplate) return;
    setPreviewMode('order');
    void openPreview(selectedTemplate, orderIdInput.trim());
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Transactional Email Template Gallery</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Version-controlled, code-backed HTML and plain-text templates with real order rendering and deterministic test fixtures.
        </p>
      </div>

      {/* Template Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((tpl) => {
          const eventType = templateKeyToEventMap[tpl.key] ?? 'ORDER_CONFIRMED';
          const policy = policyMap.get(eventType);
          const friendlyTitle = eventDisplayLabels[eventType] || tpl.key;

          return (
            <Card
              key={tpl.key}
              className="flex flex-col justify-between transition-all hover:border-primary/50 hover:shadow-xs group"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold group-hover:text-primary transition-colors">
                      {friendlyTitle}
                    </CardTitle>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{tpl.key}</p>
                  </div>
                  <Badge variant="outline" className="font-mono text-xs">
                    v{tpl.version}
                  </Badge>
                </div>
                <CardDescription className="text-xs line-clamp-2 mt-2">
                  {tpl.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 pt-0">
                {/* Policy Badges */}
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t text-[11px]">
                  <span className="text-muted-foreground">Policy:</span>
                  <Badge
                    variant={policy?.automatic_enabled ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    Auto: {policy?.automatic_enabled ? 'ON' : 'OFF'}
                  </Badge>
                  <Badge
                    variant={policy?.manual_allowed ? 'outline' : 'secondary'}
                    className="text-[10px]"
                  >
                    Manual: {policy?.manual_allowed ? 'ALLOWED' : 'BLOCKED'}
                  </Badge>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground truncate">
                    Subject: &quot;{tpl.subject}&quot;
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs shrink-0"
                    onClick={() => void openPreview(tpl)}
                  >
                    <Eye className="mr-1.5 size-3.5" /> Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Preview Dialog Modal */}
      <Dialog
        open={Boolean(selectedTemplate)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTemplate(null);
            setPreviewData(null);
            setPreviewError('');
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0 flex flex-col">
          <DialogHeader className="p-4 sm:px-6 border-b bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <DialogTitle className="text-lg">
                  {selectedTemplate ? eventDisplayLabels[templateKeyToEventMap[selectedTemplate.key] ?? ''] || selectedTemplate.key : 'Email Preview'}
                </DialogTitle>
                <DialogDescription className="text-xs font-mono">
                  Template key: {selectedTemplate?.key} · Version {selectedTemplate?.version ?? 1}
                </DialogDescription>
              </div>
            </div>

            {/* Data Source Switcher */}
            <div className="mt-4 flex flex-wrap items-center gap-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Data source:</span>
                <div className="flex rounded-md border bg-background p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewMode('fixture');
                      if (selectedTemplate) void openPreview(selectedTemplate, '', activeFixtureKey);
                    }}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      previewMode === 'fixture'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Preset Fixture
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('order')}
                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                      previewMode === 'order'
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Real Order
                  </button>
                </div>
              </div>

              {previewMode === 'fixture' ? (
                <div className="flex items-center gap-2">
                  <select
                    value={activeFixtureKey}
                    onChange={(e) => handleFixtureChange(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2.5 text-xs text-foreground focus:outline-hidden"
                  >
                    <option value="multi-item">Multi-item Order (Fatema · Kurti & Dupatta)</option>
                    <option value="simple-cod">Simple COD Order (Tanvir · Minimalist Wallet)</option>
                    <option value="discounted">Discounted Order (Sabrina · Jewelry Promo)</option>
                    <option value="large-order">Large Order (Dr. Nusrat · Saree & Accessories)</option>
                    <option value="cancelled">Cancelled Order (Rafiqul · Cotton Panjabi)</option>
                    <option value="refunded">Refunded Order (Mehzabin · Anarkali Gown)</option>
                  </select>
                </div>
              ) : (
                <form onSubmit={handleOrderPreviewSubmit} className="flex items-center gap-2">
                  <Input
                    value={orderIdInput}
                    onChange={(e) => setOrderIdInput(e.target.value)}
                    placeholder="Enter Order ID or Number (e.g. MV-10248)…"
                    className="h-8 w-60 text-xs"
                  />
                  <Button type="submit" size="sm" variant="outline" className="h-8 text-xs" disabled={previewLoading}>
                    Render Order
                  </Button>
                </form>
              )}
            </div>
          </DialogHeader>

          {/* Dialog Body with Preview */}
          <div className="p-4 sm:p-6 flex-1">
            {previewError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
                <p className="font-semibold">Preview Render Failed</p>
                <p className="mt-1">{previewError}</p>
              </div>
            ) : null}

            {previewLoading ? (
              <div className="flex h-96 items-center justify-center text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Rendering production email template…
                </span>
              </div>
            ) : previewData ? (
              <EmailPreviewFrame
                subject={previewData.subject}
                html={previewData.html}
                text={previewData.text}
                isSampleFixture={previewData.isSampleFixture}
                fixtureName={activeFixtureKey}
                recipient={previewData.intendedRecipient}
                showBanner={true}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
