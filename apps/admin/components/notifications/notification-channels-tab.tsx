'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiRequest } from '@/lib/api';
import { cn } from '@/lib/utils';
import { NotificationChannelBadge } from './notification-status-badge';

interface EmailDiagnostics {
  readonly provider: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly from: string;
  readonly replyTo: string;
  readonly providerConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly allowedTestRecipients: readonly string[];
}

interface SmsDiagnostics {
  readonly provider: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly providerConfigured: boolean;
  readonly senderType?: string;
  readonly senderId?: string;
  readonly allowedTestRecipients: readonly string[];
  readonly deliveryReceiptsSupported: boolean;
}

export function NotificationChannelsTab() {
  const [emailDiag, setEmailDiag] = useState<EmailDiagnostics | null>(null);
  const [smsDiag, setSmsDiag] = useState<SmsDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Email Test Send Dialog
  const [emailTestOpen, setEmailTestOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingEmailTest, setSendingEmailTest] = useState(false);
  const [emailTestSuccess, setEmailTestSuccess] = useState<string | null>(null);

  // SMS Test Send Dialog
  const [smsTestOpen, setSmsTestOpen] = useState(false);
  const [testSmsRecipient, setTestSmsRecipient] = useState('');
  const [sendingSmsTest, setSendingSmsTest] = useState(false);
  const [smsTestSuccess, setSmsTestSuccess] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [emailRes, smsRes] = await Promise.all([
        apiRequest<{ data: EmailDiagnostics }>('/admin/email/diagnostics').catch(() => null),
        apiRequest<{ data: SmsDiagnostics }>('/admin/sms/diagnostics').catch(() => null),
      ]);

      if (emailRes?.data) setEmailDiag(emailRes.data);
      if (smsRes?.data) setSmsDiag(smsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load channel diagnostics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDiagnostics();
  }, [loadDiagnostics]);

  const handleSendTestEmail = async () => {
    if (!testEmailRecipient.trim()) return;
    setSendingEmailTest(true);
    setEmailTestSuccess(null);
    try {
      await apiRequest('/admin/email/test-send', {
        method: 'POST',
        body: JSON.stringify({
          notificationType: 'ORDER_CONFIRMED',
          testRecipient: testEmailRecipient.trim(),
          reason: 'Manual test send from Channel Management.',
        }),
      });
      setEmailTestSuccess(`Test email dispatched successfully to ${testEmailRecipient.trim()}.`);
      setEmailTestOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Test send failed. Verify allow-list permissions.');
    } finally {
      setSendingEmailTest(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testSmsRecipient.trim()) return;
    setSendingSmsTest(true);
    setSmsTestSuccess(null);
    try {
      await apiRequest('/admin/sms/test-lab', {
        method: 'POST',
        body: JSON.stringify({
          orderId: '00000000-0000-0000-0000-000000000000',
          notificationType: 'ORDER_CONFIRMED',
          testRecipient: testSmsRecipient.trim(),
          scenario: 'DELIVERED',
          idempotencyKey: `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          reason: 'Manual test from Channel Management.',
        }),
      });
      setSmsTestSuccess(`Test SMS dispatched to ${testSmsRecipient.trim()}.`);
      setSmsTestOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'SMS test dispatch failed.');
    } finally {
      setSendingSmsTest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications Success Feedback */}
      {(emailTestSuccess || smsTestSuccess) && (
        <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{emailTestSuccess || smsTestSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setEmailTestSuccess(null);
              setSmsTestSuccess(null);
            }}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Overview Banner */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card shadow-2xs">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Channel Adapters & Provider Health</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time status of connected messaging providers, credentials, and dispatch readiness.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadDiagnostics()}
          className="h-8 text-xs border-border"
        >
          <RefreshCw className={cn('size-3.5 mr-1.5', loading && 'animate-spin')} />
          Refresh Status
        </Button>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Email Channel Card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  <Mail className="size-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Transactional Email</h4>
                  <span className="text-[11px] text-muted-foreground">Provider: Resend</span>
                </div>
              </div>

              {emailDiag?.providerConfigured ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[11px] gap-1"
                >
                  <CheckCircle2 className="size-3" /> Operational
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber-500/30 text-amber-700 text-[11px] gap-1">
                  <AlertCircle className="size-3" /> Not Configured
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Delivers transactional order receipts, dispatch updates, and return confirmations via Resend.
            </p>

            <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Sender Identity:</span>
                <span className="font-medium text-foreground font-mono text-[11px]">
                  {emailDiag?.from || 'Configured via Environment'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Reply-To Address:</span>
                <span className="font-medium text-foreground font-mono text-[11px]">
                  {emailDiag?.replyTo || 'support@maevelle.com.bd'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Environment:</span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {emailDiag?.environment || 'development'}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Webhook Verification:</span>
                <span className="text-foreground">
                  {emailDiag?.webhookConfigured ? 'Active (Svix signatures verified)' : 'Not configured'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Credentials Security:</span>
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                  <Lock className="size-3 text-muted-foreground" /> Configured in deployment environment
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (emailDiag?.allowedTestRecipients[0]) {
                  setTestEmailRecipient(emailDiag.allowedTestRecipients[0]);
                }
                setEmailTestOpen(true);
              }}
              className="h-8 text-xs border-border"
            >
              <Send className="size-3.5 mr-1" /> Test Send
            </Button>

            <Link href="/email">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-primary hover:text-primary-hover gap-1">
                Email Console <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* SMS Channel Card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Transactional SMS</h4>
                  <span className="text-[11px] text-muted-foreground">
                    Provider: {smsDiag?.provider || 'Mock / Bangladesh Gateway'}
                  </span>
                </div>
              </div>

              {smsDiag?.provider === 'mock' ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 text-[11px] gap-1"
                >
                  Mock Gateway (Dev)
                </Badge>
              ) : smsDiag?.providerConfigured ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[11px] gap-1"
                >
                  <CheckCircle2 className="size-3" /> Operational
                </Badge>
              ) : (
                <Badge variant="outline" className="border-border text-muted-foreground text-[11px]">
                  Provider Pending
                </Badge>
              )}
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Sends instant dispatch and delivery SMS to mobile phones across Bangladesh (+8801XXXXXXXXX).
            </p>

            <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Sender Mask / ID:</span>
                <span className="font-medium text-foreground font-mono text-[11px]">
                  {smsDiag?.senderId || 'Maevelle'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Mobile Normalization:</span>
                <span className="text-foreground">E.164 Bangladesh (+880)</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Delivery Receipts:</span>
                <span className="text-foreground">
                  {smsDiag?.deliveryReceiptsSupported ? 'Supported' : 'Status Pollable'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Production Adapter:</span>
                <span className="text-muted-foreground">Pending provider onboarding gate</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (smsDiag?.allowedTestRecipients[0]) {
                  setTestSmsRecipient(smsDiag.allowedTestRecipients[0]);
                }
                setSmsTestOpen(true);
              }}
              className="h-8 text-xs border-border"
            >
              <Send className="size-3.5 mr-1" /> Test Send
            </Button>

            <Link href="/sms">
              <Button variant="ghost" size="sm" className="h-8 text-xs text-primary hover:text-primary-hover gap-1">
                SMS Console <ArrowRight className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* In-App Channel Card */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-4 shadow-2xs flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
                  <Bell className="size-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground">In-App Operations Bell</h4>
                  <span className="text-[11px] text-muted-foreground">Native Core Engine</span>
                </div>
              </div>

              <Badge
                variant="outline"
                className="border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[11px] gap-1"
              >
                <CheckCircle2 className="size-3" /> Always Active
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Dispatches real-time alerts to authorized staff members based on IAM capabilities and tenant membership.
            </p>

            <div className="space-y-2 pt-2 border-t border-border/60 text-xs">
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Audience Resolution:</span>
                <span className="text-foreground">IAM Capabilities & Role Scopes</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Read/Unread Tracking:</span>
                <span className="text-foreground">Per-member independent tracking</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Retention Policy:</span>
                <span className="text-foreground">Configurable policy per event type</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/60">
            <Link href="/notifications?tab=inbox">
              <Button variant="outline" size="sm" className="h-8 text-xs border-border">
                Open In-App Inbox
              </Button>
            </Link>
          </div>
        </div>

        {/* Telegram / Social Channels (Truthfully Marked) */}
        <div className="rounded-lg border border-border/60 bg-muted/20 p-5 space-y-4 shadow-2xs flex flex-col justify-between opacity-80">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-muted text-muted-foreground border border-border">
                  <Send className="size-4" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-foreground">Telegram / Social</h4>
                  <span className="text-[11px] text-muted-foreground">External Bot Integration</span>
                </div>
              </div>

              <Badge variant="outline" className="border-border text-muted-foreground text-[11px]">
                Not Configured
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Social messaging channels require customer consent mechanisms, verified bot tokens, and
              provider selection before operational dispatch is enabled.
            </p>

            <div className="space-y-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
              <div className="flex justify-between items-center py-1">
                <span>Bot Status:</span>
                <span>Unconfigured</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>WhatsApp Business API:</span>
                <span>Planned Roadmap</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span>Push Notifications:</span>
                <span>Requires Web Push VAPID</span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border/60 text-xs text-muted-foreground italic">
            No active external social bot registered in current deployment.
          </div>
        </div>
      </div>

      {/* Test Email Dialog */}
      <Dialog open={emailTestOpen} onOpenChange={setEmailTestOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dispatches a sample Order Confirmation email via Resend to verify deliverability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label htmlFor="testEmail" className="text-xs">
                Recipient Email
              </Label>
              <Input
                id="testEmail"
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="test@example.com"
                className="mt-1 text-xs"
              />
            </div>
            {emailDiag?.allowedTestRecipients && emailDiag.allowedTestRecipients.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Allowed test recipients: {emailDiag.allowedTestRecipients.join(', ')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={sendingEmailTest}
              onClick={() => setEmailTestOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={sendingEmailTest || !testEmailRecipient.trim()}
              onClick={handleSendTestEmail}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {sendingEmailTest ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test SMS Dialog */}
      <Dialog open={smsTestOpen} onOpenChange={setSmsTestOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border">
          <DialogHeader>
            <DialogTitle>Send Test SMS</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Dispatches a sample test SMS through the SMS gateway runtime.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label htmlFor="testSms" className="text-xs">
                Recipient Bangladesh Mobile
              </Label>
              <Input
                id="testSms"
                type="tel"
                value={testSmsRecipient}
                onChange={(e) => setTestSmsRecipient(e.target.value)}
                placeholder="01700000000"
                className="mt-1 text-xs"
              />
            </div>
            {smsDiag?.allowedTestRecipients && smsDiag.allowedTestRecipients.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Allowed test recipients: {smsDiag.allowedTestRecipients.join(', ')}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={sendingSmsTest}
              onClick={() => setSmsTestOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              disabled={sendingSmsTest || !testSmsRecipient.trim()}
              onClick={handleSendTestSms}
              className="bg-primary hover:bg-primary-hover text-primary-foreground"
            >
              {sendingSmsTest ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Send SMS Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
