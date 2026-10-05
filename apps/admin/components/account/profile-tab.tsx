'use client';

import * as React from 'react';
import { useRef, useState } from 'react';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Info,
  Mail,
  RefreshCw,
  Shield,
  Trash2,
  Upload,
  User,
  XCircle,
} from 'lucide-react';
import type {
  ApiEnvelope,
  UserAccountOverviewDto,
} from '@maevelle/contracts';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/status-badge';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChangeEmailDialog } from './change-email-dialog';
import {
  formatDateTime,
  getAccountErrorMessage,
  getInitials,
  notifyAccountUpdated,
} from './account-utils';

interface ProfileTabProps {
  readonly overview: UserAccountOverviewDto;
  readonly onOverviewChange: (updated: UserAccountOverviewDto) => void;
  readonly onReload: () => Promise<void>;
}

export function ProfileTab({ overview, onOverviewChange, onReload }: ProfileTabProps) {
  const { profile, membership, pendingEmailChange } = overview;
  const initials = getInitials(profile.name);

  // Name editing state
  const [nameInput, setNameInput] = useState(profile.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Avatar state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFeedback, setAvatarFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [removeAvatarDialogOpen, setRemoveAvatarDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email state
  const [changeEmailDialogOpen, setChangeEmailDialogOpen] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [cancellingChange, setCancellingChange] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Handle display name update
  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setNameFeedback({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }

    if (trimmed === profile.name) return;

    setNameSaving(true);
    setNameFeedback(null);

    try {
      const res = await apiRequest<ApiEnvelope<{ profile: { name: string } }>>('/admin/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: trimmed }),
      });

      onOverviewChange({
        ...overview,
        profile: { ...overview.profile, name: res.data.profile.name },
      });
      setNameFeedback({ type: 'success', text: 'Your name has been updated.' });
      notifyAccountUpdated();
    } catch (err) {
      setNameFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to update your name.'),
      });
    } finally {
      setNameSaving(false);
    }
  };

  // Handle avatar upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarFeedback({
        type: 'error',
        text: 'Please select a valid image file (JPEG, PNG, or WebP).',
      });
      return;
    }

    // 2MB size limit
    if (file.size > 2 * 1024 * 1024) {
      setAvatarFeedback({
        type: 'error',
        text: 'The selected image is larger than 2MB. Please choose a smaller image.',
      });
      return;
    }

    setAvatarUploading(true);
    setAvatarFeedback(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const res = await apiRequest<ApiEnvelope<{ avatarUrl: string }>>('/admin/account/avatar', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });

      onOverviewChange({
        ...overview,
        profile: { ...overview.profile, image: res.data.avatarUrl },
      });
      setAvatarFeedback({ type: 'success', text: 'Profile photo updated successfully.' });
      notifyAccountUpdated();
    } catch (err) {
      setAvatarFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to upload profile photo.'),
      });
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle avatar removal
  const handleConfirmRemoveAvatar = async () => {
    if (!profile.image) return;
    setAvatarUploading(true);
    setAvatarFeedback(null);
    setRemoveAvatarDialogOpen(false);

    try {
      await apiRequest('/admin/account/avatar', { method: 'DELETE' });
      onOverviewChange({
        ...overview,
        profile: { ...overview.profile, image: null },
      });
      setAvatarFeedback({ type: 'success', text: 'Profile photo removed. Maevelle will display your initials.' });
      notifyAccountUpdated();
    } catch (err) {
      setAvatarFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to remove profile photo.'),
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  // Handle email verification resend
  const handleResendVerification = async () => {
    setResendingVerification(true);
    setEmailFeedback(null);

    try {
      await apiRequest('/admin/account/email/verification', { method: 'POST' });
      setEmailFeedback({
        type: 'success',
        text: `Verification link sent to ${profile.email}. Please check your inbox.`,
      });
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to send verification email. Please try again shortly.'),
      });
    } finally {
      setResendingVerification(false);
    }
  };

  // Handle cancel pending email change
  const handleCancelEmailChange = async () => {
    setCancellingChange(true);
    setEmailFeedback(null);

    try {
      await apiRequest('/admin/account/email/change/cancel', { method: 'POST' });
      setEmailFeedback({
        type: 'success',
        text: 'The pending email change request has been cancelled.',
      });
      await onReload();
    } catch (err) {
      setEmailFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to cancel the pending email change request.'),
      });
    } finally {
      setCancellingChange(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: PERSONAL IDENTITY */}
      <PageSection
        title="Personal Identity"
        description="Your personal display name and profile picture visible to team members."
      >
        <PagePanel>
          {/* Avatar row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b border-border">
            <div className="relative shrink-0">
              {profile.image ? (
                <img
                  src={profile.image}
                  alt={profile.name || 'User avatar'}
                  className="size-20 rounded-full object-cover border-2 border-border shadow-xs"
                />
              ) : (
                <div
                  className="size-20 rounded-full bg-primary/10 text-primary font-bold text-2xl flex items-center justify-center border-2 border-primary/20 shadow-xs select-none"
                  aria-hidden="true"
                >
                  {initials ? initials : <User className="size-8" />}
                </div>
              )}
              {avatarUploading ? (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-xs rounded-full flex items-center justify-center">
                  <RefreshCw className="size-5 text-primary animate-spin" />
                </div>
              ) : null}
            </div>

            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => void handleAvatarFileChange(e)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={avatarUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5 mr-1.5" />
                  {profile.image ? 'Change photo' : 'Upload photo'}
                </Button>

                {profile.image ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={avatarUploading}
                    onClick={() => setRemoveAvatarDialogOpen(true)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3.5 mr-1.5" />
                    Remove photo
                  </Button>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP. Maximum size: 2MB. Saved as a square WebP rendition.
              </p>

              {avatarFeedback ? (
                <p
                  className={`text-xs font-medium ${
                    avatarFeedback.type === 'success' ? 'text-success' : 'text-destructive'
                  }`}
                  role="status"
                >
                  {avatarFeedback.text}
                </p>
              ) : null}
            </div>
          </div>

          {/* Name Form */}
          <form onSubmit={(e) => void handleUpdateName(e)} className="pt-6 space-y-4 max-w-lg">
            <div className="space-y-1.5">
              <label htmlFor="account-name-input" className="text-xs font-semibold text-foreground">
                Display name
              </label>
              <Input
                id="account-name-input"
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Your full name"
                maxLength={100}
                required
                disabled={nameSaving}
              />
              <p className="text-[11px] text-muted-foreground">
                This is your canonical display name across Maevelle systems and team consoles.
              </p>
            </div>

            {nameFeedback ? (
              <div
                role="status"
                className={`p-3 rounded-lg text-xs border ${
                  nameFeedback.type === 'success'
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {nameFeedback.text}
              </div>
            ) : null}

            <Button
              type="submit"
              disabled={nameSaving || nameInput.trim() === profile.name || !nameInput.trim()}
            >
              {nameSaving ? (
                <>
                  <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                  Saving changes…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </form>
        </PagePanel>
      </PageSection>

      {/* SECTION 2: EMAIL ADDRESS */}
      <PageSection
        title="Email Address & Verification"
        description="Your primary sign-in identifier and account notification address."
      >
        <PagePanel>
          <div className="space-y-4 max-w-xl">
            {/* Current Email Box */}
            <div className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                    Current sign-in email
                  </span>
                  <p className="text-sm font-semibold text-foreground font-mono truncate">
                    {profile.email}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge
                    status={profile.emailVerified ? 'VERIFIED' : 'NOT VERIFIED'}
                    tone={profile.emailVerified ? 'success' : 'warning'}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setChangeEmailDialogOpen(true)}
                  >
                    Change email
                  </Button>
                </div>
              </div>

              {!profile.emailVerified ? (
                <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>
                    Verify your email address to ensure you receive operational notices and account alerts.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={resendingVerification}
                    onClick={() => void handleResendVerification()}
                    className="shrink-0"
                  >
                    {resendingVerification ? 'Sending…' : 'Resend verification link'}
                  </Button>
                </div>
              ) : null}
            </div>

            {/* Pending Email Change Notice */}
            {pendingEmailChange ? (
              <div className="p-4 rounded-xl border border-warning/40 bg-warning/10 text-xs text-foreground space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 text-warning font-semibold">
                  <Clock className="size-4 shrink-0" />
                  <span>Pending Email Change in Progress</span>
                </div>
                <p>
                  A verification message was sent to{' '}
                  <strong className="font-semibold text-foreground font-mono">{pendingEmailChange.pendingEmail}</strong>.
                  Your sign-in email remains <strong className="font-mono">{profile.email}</strong> until the new address is verified.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cancellingChange}
                    onClick={() => void handleCancelEmailChange()}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    {cancellingChange ? 'Cancelling…' : 'Cancel email change request'}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* Feedback Alerts */}
            {emailFeedback ? (
              <div
                role="status"
                className={`p-3 rounded-lg text-xs border ${
                  emailFeedback.type === 'success'
                    ? 'bg-success/10 border-success/30 text-success'
                    : 'bg-destructive/10 border-destructive/30 text-destructive'
                }`}
              >
                {emailFeedback.text}
              </div>
            ) : null}
          </div>
        </PagePanel>
      </PageSection>

      {/* SECTION 3: WORK ACCOUNT & ORGANIZATION (READ-ONLY) */}
      <PageSection
        title="Work Account & Organization"
        description="Your operational role and membership boundaries managed by your organization."
      >
        <PagePanel>
          <div className="space-y-5 max-w-xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Organization */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-primary" aria-hidden="true" />
                  Organization
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {membership?.organizationName || 'Maevelle Bangladesh'}
                </p>
              </div>

              {/* Role */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="size-3.5 text-primary" aria-hidden="true" />
                  Assigned Role
                </span>
                <p className="text-sm font-semibold text-foreground">
                  {membership?.membershipType === 'OWNER'
                    ? 'Owner / Administrator'
                    : membership?.membershipType === 'STANDARD'
                      ? 'Team Member'
                      : 'Authorized Operator'}
                </p>
              </div>

              {/* Status */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Account Status
                </span>
                <div className="pt-0.5">
                  <StatusBadge
                    status={membership?.status || 'ACTIVE'}
                    tone={membership?.status === 'ACTIVE' ? 'success' : 'neutral'}
                  />
                </div>
              </div>

              {/* Member Since */}
              <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                  Member Since
                </span>
                <p className="text-xs font-medium text-foreground tabular-nums font-mono pt-0.5">
                  {membership?.joinedAt ? formatDateTime(membership.joinedAt) : 'Active'}
                </p>
              </div>
            </div>

            {/* Clear Ownership Callout */}
            <div className="p-3 rounded-lg border border-border/60 bg-muted/30 text-xs text-muted-foreground flex items-start gap-2.5">
              <Info className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <strong className="font-semibold text-foreground">Managed by your organization:</strong> Role, permissions, and team access scopes are governed administratively in Team & Access. They cannot be altered through self-service profile updates.
              </div>
            </div>
          </div>
        </PagePanel>
      </PageSection>

      {/* Remove Avatar Confirmation Dialog */}
      <AlertDialog open={removeAvatarDialogOpen} onOpenChange={setRemoveAvatarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove profile photo?</AlertDialogTitle>
            <AlertDialogDescription>
              Your custom photo will be permanently deleted and Maevelle will display your name initials instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmRemoveAvatar()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Remove photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Email Flow Dialog */}
      <ChangeEmailDialog
        open={changeEmailDialogOpen}
        currentEmail={profile.email}
        onOpenChange={setChangeEmailDialogOpen}
        onSuccess={(pendingEmail) => {
          setEmailFeedback({
            type: 'success',
            text: `Verification link sent to ${pendingEmail}. Please verify the new address to complete the change.`,
          });
          void onReload();
        }}
      />
    </div>
  );
}
