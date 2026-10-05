'use client';

import * as React from 'react';
import { useState } from 'react';
import { Check, Copy, Download, KeyRound, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export interface RecoveryCodesPanelProps {
  readonly codes: readonly string[];
  readonly userEmail?: string | undefined;
  readonly onConfirmed?: (() => void) | undefined;
  readonly confirmLabel?: string | undefined;
  readonly requireAcknowledgement?: boolean | undefined;
}

export function RecoveryCodesPanel({
  codes,
  userEmail,
  onConfirmed,
  confirmLabel = 'I have stored these codes safely',
  requireAcknowledgement = true,
}: RecoveryCodesPanelProps) {
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(!requireAcknowledgement);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
    }
  };

  const handleDownload = () => {
    const timestamp = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const content = [
      '========================================================================',
      'MAEVELLE BUSINESS OPERATIONS — TWO-FACTOR RECOVERY CODES',
      '========================================================================',
      userEmail ? `Account: ${userEmail}` : 'Account: Maevelle Administrator',
      `Generated: ${timestamp}`,
      '',
      'CRITICAL SECURITY NOTICE:',
      '- Store these codes in an encrypted password manager or secure location.',
      '- Each recovery code can only be used ONCE to sign in to Maevelle.',
      '- Keep these codes private. Never share them with anyone.',
      '========================================================================',
      '',
      ...codes.map((code, index) => `${String(index + 1).padStart(2, '0')}. ${code}`),
      '',
      '========================================================================',
    ].join('\r\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `maevelle-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 rounded-xl border border-warning/30 bg-warning/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <KeyRound className="size-4" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Save your recovery codes</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            If you ever lose access to your authenticator app, these one-time codes are the only way to recover your account without an administrator reset.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        {codes.map((code, index) => (
          <div
            key={code}
            className="flex items-center justify-between rounded-lg border border-border/80 bg-card px-3 py-2 text-xs font-mono tabular-nums shadow-2xs"
          >
            <span className="text-muted-foreground select-none text-[11px] font-sans">
              #{index + 1}
            </span>
            <span className="font-semibold tracking-wider text-foreground">{code}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs transition-colors duration-150"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="size-3.5 text-success" />
              <span className="text-success font-medium">Copied to clipboard</span>
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              <span>Copy all codes</span>
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs transition-colors duration-150"
          onClick={handleDownload}
        >
          <Download className="size-3.5" />
          <span>Download text file</span>
        </Button>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground flex items-center gap-2">
        <ShieldAlert className="size-4 text-warning shrink-0" />
        <span>
          Each code can only be used once. Once used, it is permanently consumed. Do not store these in browser notes.
        </span>
      </div>

      {requireAcknowledgement && (
        <div className="flex items-start gap-2.5 pt-1">
          <Checkbox
            id="acknowledge-saved-codes"
            checked={acknowledged}
            onCheckedChange={(checked) => setAcknowledged(Boolean(checked))}
            className="mt-0.5"
          />
          <Label
            htmlFor="acknowledge-saved-codes"
            className="text-xs text-foreground cursor-pointer select-none leading-normal font-medium"
          >
            I have saved these recovery codes in a secure offline location or password manager
          </Label>
        </div>
      )}

      {onConfirmed && (
        <div className="pt-2">
          <Button
            type="button"
            className="w-full sm:w-auto h-9 text-xs font-semibold"
            disabled={!acknowledged}
            onClick={onConfirmed}
          >
            {confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
