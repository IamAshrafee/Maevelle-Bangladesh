'use client';

import { useState } from 'react';
import {
  Zap,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Radio,
  ShieldCheck,
  Server,
  Mail,
  User,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmailPreviewFrame } from './email-preview-frame';
import { EmailStatusBadge } from './email-status-badge';
import {
  type EmailDiagnosticsDto,
  type EmailTemplateSummary,
  type EmailPreviewResponse,
  type EmailNotificationRowDto,
  eventDisplayLabels,
  templateKeyToEventMap,
  fetchEmailApi,
  formatDateTime,
} from './email-types';

interface EmailTestLabTabProps {
  readonly diagnostic: EmailDiagnosticsDto | undefined;
  readonly templates: readonly EmailTemplateSummary[];
  readonly recentEmails: readonly EmailNotificationRowDto[];
  readonly onInspectEmail: (email: EmailNotificationRowDto) => void;
  readonly onRefresh: () => void;
}

export function EmailTestLabTab({
  diagnostic,
  templates,
  recentEmails,
  onInspectEmail,
  onRefresh,
}: EmailTestLabTabProps) {
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('order-confirmed');
  const [dataSource, setDataSource] = useState<'fixture' | 'order'>('fixture');
  const [fixtureKey, setFixtureKey] = useState('multi-item');
  const [orderId, setOrderId] = useState('');
  const [testRecipient, setTestRecipient] = useState(
    diagnostic?.allowedTestRecipients?.[0] || 'developer@example.com',
  );
  const [customReason, setCustomReason] = useState('Operator verification send from Test Lab');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreviewResponse | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const recentTestEmails = recentEmails.filter((e) => e.trigger_type === 'TEST');
  const selectedEvent = templateKeyToEventMap[selectedTemplateKey] ?? 'ORDER_CONFIRMED';

  const loadPreview = async () => {
    setPreviewLoading(true);
    setErrorMessage('');
    try {
      const response = await fetchEmailApi<{ data: EmailPreviewResponse }>(
        `/admin/email/templates/${selectedEvent}/preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...(dataSource === 'order' && orderId.trim() ? { orderId: orderId.trim() } : {}),
            ...(dataSource === 'fixture' && fixtureKey ? { fixtureKey } : {}),
          }),
        },
      );
      setPreviewData(response.data);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not generate preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const executeTestSend = async () => {
    setSending(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await fetchEmailApi('/admin/email/test-send', {
        method: 'POST',
        body: JSON.stringify({
          notificationType: selectedEvent,
          testRecipient: testRecipient.trim(),
          ...(dataSource === 'order' && orderId.trim() ? { orderId: orderId.trim() } : {}),
          ...(dataSource === 'fixture' && fixtureKey ? { fixtureKey } : {}),
          reason: customReason.trim(),
        }),
      });
      setConfirmDialogOpen(false);
      setSuccessMessage(
        `Safe test email queued for ${testRecipient.trim()}. The worker will process delivery and Resend will report status.`,
      );
      onRefresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send test email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Test Lab Banner */}
      <div className="rounded-xl border bg-card p-4 sm:p-6 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            <h2 className="text-lg font-bold">Transactional Email Test & Development Lab</h2>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-mono text-xs">
            Safety Guard Active: Only Allow-Listed Recipients
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground max-w-3xl">
          Test real transactional email rendering and Resend delivery workflows safely in development and staging.
          Test sends are strictly prohibited from messaging live customers, apply development overrides automatically,
          and record complete webhook delivery receipts.
        </p>
      </div>

      {successMessage ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
          <span className="font-medium">{successMessage}</span>
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setSuccessMessage('')}>
            Dismiss
          </Button>
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {/* Configuration & Controls Section */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Form: Test Parameters */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-base">1. Configure Test Parameters</CardTitle>
              <CardDescription className="text-xs">
                Select template, data source, and target test recipient
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-xs">
              {/* Template Picker */}
              <div className="space-y-1.5">
                <Label htmlFor="test-template-picker">Email Template</Label>
                <select
                  id="test-template-picker"
                  value={selectedTemplateKey}
                  onChange={(e) => {
                    setSelectedTemplateKey(e.target.value);
                    setPreviewData(null);
                  }}
                  className="h-9 w-full rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.key} value={tpl.key}>
                      {eventDisplayLabels[templateKeyToEventMap[tpl.key] ?? ''] || tpl.key} ({tpl.key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Data Source Selector */}
              <div className="space-y-1.5">
                <Label>Data Source</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDataSource('fixture');
                      setPreviewData(null);
                    }}
                    className={`flex items-center justify-center p-2 rounded-md border text-xs font-medium transition-colors ${
                      dataSource === 'fixture'
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-input hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    Preset Fixture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDataSource('order');
                      setPreviewData(null);
                    }}
                    className={`flex items-center justify-center p-2 rounded-md border text-xs font-medium transition-colors ${
                      dataSource === 'order'
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-input hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    Existing Order
                  </button>
                </div>
              </div>

              {dataSource === 'fixture' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="test-fixture-picker">Sample Fixture</Label>
                  <select
                    id="test-fixture-picker"
                    value={fixtureKey}
                    onChange={(e) => {
                      setFixtureKey(e.target.value);
                      setPreviewData(null);
                    }}
                    className="h-9 w-full rounded-md border bg-background px-3 text-xs text-foreground focus:outline-hidden"
                  >
                    <option value="multi-item">Multi-item Order (Fatema · Kurti & Dupatta)</option>
                    <option value="simple-cod">Simple COD Order (Tanvir · Minimalist Wallet)</option>
                    <option value="discounted">Discounted Order (Sabrina · Jewelry Promo)</option>
                    <option value="large-order">Large Multi-line Order (Dr. Nusrat · Saree)</option>
                    <option value="cancelled">Cancelled Order (Rafiqul · Panjabi)</option>
                    <option value="refunded">Refund Completed Order (Mehzabin · Anarkali)</option>
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="test-order-input">Order ID or Number</Label>
                  <Input
                    id="test-order-input"
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="e.g. MV-10248 or full UUID"
                    className="h-9 text-xs"
                  />
                </div>
              )}

              {/* Target Test Recipient */}
              <div className="space-y-1.5 pt-2 border-t">
                <Label htmlFor="test-recipient-input">Allow-Listed Test Recipient Email</Label>
                <Input
                  id="test-recipient-input"
                  type="email"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="developer@example.com"
                  className="h-9 font-mono text-xs"
                />
                {diagnostic?.allowedTestRecipients && diagnostic.allowedTestRecipients.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1 pt-1">
                    <span className="text-[11px] text-muted-foreground">Quick pick:</span>
                    {diagnostic.allowedTestRecipients.map((email) => (
                      <button
                        key={email}
                        type="button"
                        onClick={() => setTestRecipient(email)}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground hover:bg-muted-foreground/20 transition-colors"
                      >
                        {email}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2 pt-3">
                <Button
                  variant="outline"
                  onClick={loadPreview}
                  disabled={previewLoading || (dataSource === 'order' && !orderId.trim())}
                  className="flex-1 text-xs"
                >
                  <Eye className="mr-1.5 size-3.5" />
                  {previewLoading ? 'Rendering…' : 'Update Live Preview'}
                </Button>
                <Button
                  onClick={() => setConfirmDialogOpen(true)}
                  disabled={
                    !testRecipient.trim() ||
                    (dataSource === 'order' && !orderId.trim()) ||
                    sending
                  }
                  className="flex-1 text-xs"
                >
                  <Send className="mr-1.5 size-3.5" />
                  Send Safe Test Copy
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Test Sends Panel */}
          <Card>
            <CardHeader className="pb-3 border-b bg-muted/20">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Recent Test Sends Log</CardTitle>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onRefresh}>
                  <RotateCw className="size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y text-xs">
                {recentTestEmails.slice(0, 5).map((testRow) => (
                  <div
                    key={testRow.id}
                    onClick={() => onInspectEmail(testRow)}
                    className="p-3 hover:bg-muted/40 cursor-pointer transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">
                        {eventDisplayLabels[testRow.notification_type] || testRow.notification_type}
                      </span>
                      <EmailStatusBadge status={testRow.status} />
                    </div>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      To: {testRow.effective_recipient || testRow.intended_recipient}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatDateTime(testRow.created_at)} · ID: {testRow.id.slice(0, 8)}…
                    </p>
                  </div>
                ))}
                {recentTestEmails.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground text-xs">
                    No test emails sent yet. Select parameters above to test delivery.
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel: Live Preview Frame */}
        <div className="lg:col-span-7">
          {previewData ? (
            <EmailPreviewFrame
              subject={previewData.subject}
              html={previewData.html}
              text={previewData.text}
              recipient={testRecipient || previewData.intendedRecipient}
              isSampleFixture={previewData.isSampleFixture}
              fixtureName={fixtureKey}
              showBanner={true}
            />
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center text-muted-foreground">
              <Mail className="size-8 opacity-20 mb-2" />
              <p className="font-semibold text-sm text-foreground">No Live Preview Loaded</p>
              <p className="mt-1 text-xs max-w-sm">
                Click <strong>&quot;Update Live Preview&quot;</strong> to render the selected template with real order data or sample fixtures before sending.
              </p>
              <Button size="sm" variant="outline" onClick={loadPreview} className="mt-4 text-xs">
                Load Preview Now
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Safe Test Send</DialogTitle>
            <DialogDescription>
              This will dispatch a real transactional email via Resend to the allow-listed recipient.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <p><strong>Event:</strong> {eventDisplayLabels[selectedEvent] || selectedEvent}</p>
              <p><strong>Recipient:</strong> <code className="font-mono">{testRecipient}</code></p>
              <p><strong>Provider:</strong> {diagnostic?.provider === 'resend' ? 'Resend' : 'Local Adapter'}</p>
              <p><strong>Data Source:</strong> {dataSource === 'fixture' ? `Preset: ${fixtureKey}` : `Order: ${orderId}`}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-audit-reason">Audited Reason</Label>
              <Input
                id="test-audit-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Why are you running this test?"
                className="text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={executeTestSend} disabled={sending || !customReason.trim()}>
              {sending ? 'Sending…' : 'Confirm & Send Test'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
