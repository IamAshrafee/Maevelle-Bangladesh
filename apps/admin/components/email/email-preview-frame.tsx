'use client';

import { useState } from 'react';
import { Smartphone, Monitor, FileText, Copy, Check, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EmailPreviewFrameProps {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly from?: string | undefined;
  readonly replyTo?: string | undefined;
  readonly recipient?: string | null | undefined;
  readonly intendedRecipient?: string | null | undefined;
  readonly supportEmail?: string | undefined;
  readonly templateKey?: string | undefined;
  readonly templateVersion?: number | undefined;
  readonly isSampleFixture?: boolean | undefined;
  readonly fixtureName?: string | undefined;
  readonly showBanner?: boolean | undefined;
  readonly className?: string | undefined;
}

export function EmailPreviewFrame({
  subject,
  html,
  text,
  from = 'Maevelle <orders@maevelle.com>',
  replyTo = 'maevelleBangladesh@gmail.com',
  recipient,
  intendedRecipient,
  supportEmail,
  templateKey,
  templateVersion,
  isSampleFixture = false,
  fixtureName,
  showBanner = true,
  className,
}: EmailPreviewFrameProps) {
  const effectiveRecipient = recipient ?? intendedRecipient ?? 'customer@example.com';
  const effectiveReplyTo = supportEmail ?? replyTo;
  const [mode, setMode] = useState<'desktop' | 'mobile' | 'text'>('desktop');
  const [copied, setCopied] = useState(false);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className={cn('flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden', className)}>
      {/* Top Controls & Meta */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 p-3 sm:px-4">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-background p-0.5 text-xs shadow-xs">
            <button
              type="button"
              onClick={() => setMode('desktop')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === 'desktop'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Monitor className="size-3.5" aria-hidden="true" />
              <span>Desktop (640px)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('mobile')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === 'mobile'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Smartphone className="size-3.5" aria-hidden="true" />
              <span>Mobile (375px)</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('text')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium transition-colors',
                mode === 'text'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileText className="size-3.5" aria-hidden="true" />
              <span>Plain Text</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSampleFixture ? (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              Sample Fixture {fixtureName ? `· ${fixtureName}` : ''}
            </Badge>
          ) : (
            <Badge variant="secondary">Rendered with Real Order Data</Badge>
          )}
          {mode === 'text' ? (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyText}>
              {copied ? <Check className="mr-1 size-3 text-emerald-600" /> : <Copy className="mr-1 size-3" />}
              {copied ? 'Copied' : 'Copy Text'}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Simulated Email Envelope Header */}
      <div className="grid gap-1.5 border-b bg-background px-4 py-3 text-xs sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-muted-foreground w-16">Subject:</span>
          <span className="font-medium text-foreground">{subject}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-muted-foreground w-16">From:</span>
          <span className="text-foreground">{from}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-muted-foreground w-16">Reply-To:</span>
          <span className="font-mono text-emerald-800 dark:text-emerald-400">{effectiveReplyTo}</span>
          <span className="text-[11px] text-muted-foreground">(Human customer support mailbox)</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-muted-foreground w-16">To:</span>
          <span className="font-mono text-foreground">{effectiveRecipient}</span>
        </div>
      </div>

      {/* Preview Warning Banner */}
      {showBanner ? (
        <div className="flex items-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs font-medium text-amber-900 dark:text-amber-200">
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span>PREVIEW ONLY — Zero business side effects. No email or external network request was sent.</span>
        </div>
      ) : null}

      {/* Preview Body Area */}
      <div className="flex min-h-[480px] max-h-[680px] w-full items-center justify-center overflow-auto bg-muted/30 p-4 sm:p-6">
        {mode === 'text' ? (
          <div className="h-full w-full max-w-2xl rounded-lg border bg-background p-4 shadow-xs">
            <pre className="whitespace-pre-wrap font-mono text-xs text-foreground leading-relaxed selection:bg-primary/20">
              {text}
            </pre>
          </div>
        ) : (
          <div
            className={cn(
              'transition-all duration-200 ease-in-out overflow-hidden rounded-xl border bg-white shadow-md',
              mode === 'desktop' ? 'w-full max-w-[640px]' : 'w-[375px] max-w-full ring-8 ring-neutral-800/10',
            )}
          >
            {/* Sandboxed iframe for safe and accurate email HTML rendering */}
            <iframe
              title={`Email preview: ${subject}`}
              srcDoc={html}
              sandbox="allow-same-origin"
              className={cn(
                'w-full border-none transition-all',
                mode === 'desktop' ? 'min-h-[520px] h-[580px]' : 'min-h-[600px] h-[640px]',
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
