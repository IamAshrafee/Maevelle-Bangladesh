'use client';

import * as React from 'react';
import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getAccountErrorMessage } from './account-utils';

interface ChangeEmailDialogProps {
  readonly open: boolean;
  readonly currentEmail: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: (pendingEmail: string) => void;
}

export function ChangeEmailDialog({
  open,
  currentEmail,
  onOpenChange,
  onSuccess,
}: ChangeEmailDialogProps) {
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = () => {
    setNewEmail('');
    setPassword('');
    setShowPassword(false);
    setError(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Please enter a new email address.');
      return;
    }

    if (trimmedEmail === currentEmail.toLowerCase()) {
      setError('The new email address cannot be the same as your current email.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (!password) {
      setError('Your current password is required to authorize this change.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await apiRequest<ApiEnvelope<{ pendingEmail: string; message: string }>>(
        '/admin/account/email/change',
        {
          method: 'POST',
          body: JSON.stringify({
            newEmail: trimmedEmail,
            currentPassword: password,
          }),
        },
      );

      const requestedEmail = res.data.pendingEmail || trimmedEmail;
      handleClose();
      onSuccess(requestedEmail);
    } catch (err) {
      setError(getAccountErrorMessage(err, 'Failed to request email change. Please check your credentials.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Mail className="size-4" />
            </div>
            <DialogTitle>Change Sign-in Email</DialogTitle>
          </div>
          <DialogDescription>
            Request a change to your primary Maevelle sign-in email address. Fresh password authentication is required.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {/* Current Email Display */}
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/40 border border-border/70">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
              Current sign-in email
            </span>
            <span className="text-xs font-mono font-medium text-foreground select-all">
              {currentEmail}
            </span>
          </div>

          {/* New Email Input */}
          <div className="space-y-1.5">
            <label htmlFor="modal-new-email" className="text-xs font-semibold text-foreground">
              New email address
            </label>
            <Input
              id="modal-new-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. name@maevelle.com"
              autoComplete="email"
              required
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              A verification link will be delivered to this address.
            </p>
          </div>

          {/* Current Password Reauthentication */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="modal-email-password" className="text-xs font-semibold text-foreground">
                Current password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div className="relative">
              <Input
                id="modal-email-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                required
                disabled={submitting}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Confirm your identity to ensure only you can update this security-sensitive setting.
            </p>
          </div>

          {/* Reassurance Callout */}
          <div className="p-3 rounded-lg border border-primary/20 bg-primary-subtle text-[11px] text-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              Your current sign-in email will remain active and usable until you verify the new address via the email link.
            </span>
          </div>

          {/* Error Alert */}
          {error ? (
            <div
              role="alert"
              className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive"
            >
              {error}
            </div>
          ) : null}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !newEmail || !password}>
              {submitting ? (
                <>
                  <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                  Sending verification…
                </>
              ) : (
                'Send verification link'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
