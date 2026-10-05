'use client';

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Building2,
  Clock,
  Laptop,
  LogOut,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

import type {
  AccountSecurityActivityItemDto,
  AccountSessionItemDto,
  ApiEnvelope,
  UserAccountOverviewDto,
} from '@maevelle/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/status-badge';
import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageHeader,
  PagePanel,
  PageSection,
} from '@/components/ui/page-shell';

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export function MyAccountConsole() {
  const router = useRouter();
  const [overview, setOverview] = useState<UserAccountOverviewDto | null>(null);
  const [sessions, setSessions] = useState<readonly AccountSessionItemDto[]>([]);
  const [activities, setActivities] = useState<readonly AccountSecurityActivityItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Active section tab
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions' | 'activity'>('profile');

  // Profile editing state
  const [nameInput, setNameInput] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Email verification resend state
  const [resendingVerification, setResendingVerification] = useState(false);
  const [emailMessage, setEmailMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Email change state
  const [emailChangePassword, setEmailChangePassword] = useState('');
  const [newEmailInput, setNewEmailInput] = useState('');
  const [submittingEmailChange, setSubmittingEmailChange] = useState(false);
  const [cancellingEmailChange, setCancellingEmailChange] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [submittingPassword, setSubmittingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Session revocation state
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setPageError(null);
      const [overviewRes, sessionsRes, activityRes] = await Promise.all([
        apiRequest<ApiEnvelope<UserAccountOverviewDto>>('/admin/account/overview'),
        apiRequest<ApiEnvelope<AccountSessionItemDto[]>>('/admin/account/sessions').catch(() => ({ data: [] })),
        apiRequest<ApiEnvelope<AccountSecurityActivityItemDto[]>>('/admin/account/security/activity').catch(() => ({ data: [] })),
      ]);

      setOverview(overviewRes.data);
      setNameInput(overviewRes.data.profile.name);
      setSessions(sessionsRes.data ?? []);
      setActivities(activityRes.data ?? []);
    } catch (error) {
      setPageError(getErrorMessage(error, 'Failed to load account information. Please sign in again.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle personal name update
  const handleUpdateProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameInput.trim()) {
      setProfileMessage({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const res = await apiRequest<ApiEnvelope<{ profile: { name: string } }>>('/admin/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setProfileMessage({ type: 'success', text: 'Your display name has been updated.' });
      if (overview) {
        setOverview({
          ...overview,
          profile: { ...overview.profile, name: res.data.profile.name },
        });
      }
    } catch (error) {
      setProfileMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to update display name.'),
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle avatar upload
  const handleAvatarFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarMessage({ type: 'error', text: 'Please select a valid JPEG, PNG, or WebP image.' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setAvatarMessage({ type: 'error', text: 'Profile picture must be under 2MB in size.' });
      return;
    }

    setAvatarUploading(true);
    setAvatarMessage(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');

      const res = await apiRequest<ApiEnvelope<{ avatarUrl: string }>>('/admin/account/avatar', {
        method: 'POST',
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });

      setAvatarMessage({ type: 'success', text: 'Profile picture uploaded and processed successfully.' });
      if (overview) {
        setOverview({
          ...overview,
          profile: { ...overview.profile, image: res.data.avatarUrl },
        });
      }
    } catch (error) {
      setAvatarMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to upload profile picture.'),
      });
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle avatar removal
  const handleRemoveAvatar = async () => {
    if (!overview?.profile.image) return;
    setAvatarUploading(true);
    setAvatarMessage(null);
    try {
      await apiRequest('/admin/account/avatar', { method: 'DELETE' });
      setAvatarMessage({ type: 'success', text: 'Profile picture removed.' });
      if (overview) {
        setOverview({
          ...overview,
          profile: { ...overview.profile, image: null },
        });
      }
    } catch (error) {
      setAvatarMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to remove profile picture.'),
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  // Handle resend verification email
  const handleResendVerification = async () => {
    setResendingVerification(true);
    setEmailMessage(null);
    try {
      await apiRequest('/admin/account/email/resend-verification', { method: 'POST' });
      setEmailMessage({
        type: 'success',
        text: 'A verification link has been sent to your email address.',
      });
    } catch (error) {
      setEmailMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to send verification email. Please wait before retrying.'),
      });
    } finally {
      setResendingVerification(false);
    }
  };

  // Handle request email change
  const handleRequestEmailChange = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!emailChangePassword || !newEmailInput) {
      setEmailMessage({ type: 'error', text: 'Current password and new email are required.' });
      return;
    }
    setSubmittingEmailChange(true);
    setEmailMessage(null);
    try {
      const res = await apiRequest<ApiEnvelope<{ pendingEmail: string; message: string }>>(
        '/admin/account/email/request-change',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword: emailChangePassword,
            newEmail: newEmailInput.trim(),
          }),
        },
      );
      setEmailMessage({
        type: 'success',
        text: res.data.message || `Verification email sent to ${res.data.pendingEmail}.`,
      });
      setEmailChangePassword('');
      setNewEmailInput('');
      void loadData();
    } catch (error) {
      setEmailMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to request email change.'),
      });
    } finally {
      setSubmittingEmailChange(false);
    }
  };

  // Handle cancel pending email change
  const handleCancelEmailChange = async () => {
    setCancellingEmailChange(true);
    setEmailMessage(null);
    try {
      await apiRequest('/admin/account/email/cancel-change', { method: 'POST' });
      setEmailMessage({ type: 'success', text: 'Pending email change request cancelled.' });
      void loadData();
    } catch (error) {
      setEmailMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to cancel pending email change.'),
      });
    } finally {
      setCancellingEmailChange(false);
    }
  };

  // Handle password change
  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword) {
      setPasswordMessage({ type: 'error', text: 'Current password is required.' });
      return;
    }
    if (newPassword.length < 12) {
      setPasswordMessage({ type: 'error', text: 'New password must be at least 12 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setSubmittingPassword(true);
    setPasswordMessage(null);
    try {
      await apiRequest('/admin/account/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions,
        }),
      });
      setPasswordMessage({
        type: 'success',
        text: 'Password updated successfully. Other active sessions were revoked.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      void loadData();
    } catch (error) {
      setPasswordMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to update password.'),
      });
    } finally {
      setSubmittingPassword(false);
    }
  };

  // Handle revoke single session
  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSessionId(sessionId);
    setSessionMessage(null);
    try {
      await apiRequest(`/admin/account/sessions/${sessionId}`, { method: 'DELETE' });
      setSessionMessage({ type: 'success', text: 'The session has been revoked.' });
      void loadData();
    } catch (error) {
      setSessionMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to revoke session.'),
      });
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Handle revoke all other sessions
  const handleRevokeOtherSessions = async () => {
    setRevokingOthers(true);
    setSessionMessage(null);
    try {
      await apiRequest('/admin/account/sessions/other', { method: 'DELETE' });
      setSessionMessage({ type: 'success', text: 'All other active sessions have been signed out.' });
      void loadData();
    } catch (error) {
      setSessionMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to revoke other sessions.'),
      });
    } finally {
      setRevokingOthers(false);
    }
  };

  // Handle sign out everywhere
  const handleSignOutEverywhere = async () => {
    if (!window.confirm('Are you sure you want to sign out of all devices including this current browser?')) {
      return;
    }
    setRevokingAll(true);
    try {
      await apiRequest('/admin/account/sessions/all', { method: 'DELETE' });
      router.replace('/login');
    } catch (error) {
      setSessionMessage({
        type: 'error',
        text: getErrorMessage(error, 'Failed to sign out everywhere.'),
      });
      setRevokingAll(false);
    }
  };

  if (loading) {
    return <LoadingState message="Loading your account profile…" />;
  }

  if (pageError || !overview) {
    return (
      <ErrorState
        title="Could not access My Account"
        message={pageError ?? 'Account overview is unavailable.'}
        onRetry={loadData}
      />
    );
  }

  const { profile, membership, security, pendingEmailChange } = overview;
  const initials = profile.name
    ? profile.name
        .split(' ')
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  return (
    <AdminPage>
      <PageHeader
        title="My Account"
        description="Personal profile, identity credentials, security settings, and active devices."
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={profile.emailVerified ? 'VERIFIED' : 'UNVERIFIED'}
            tone={profile.emailVerified ? 'success' : 'warning'}
          />
          <StatusBadge
            status={security.twoFactorEnabled ? '2FA ENABLED' : '2FA DISABLED'}
            tone={security.twoFactorEnabled ? 'success' : 'warning'}
          />
          <span className="text-xs text-muted-foreground bg-muted/60 px-2.5 py-1 rounded-full border border-border/60 tabular-nums">
            {security.activeSessionsCount} active {security.activeSessionsCount === 1 ? 'session' : 'sessions'}
          </span>
        </div>
      </PageHeader>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border mb-6 gap-1 overflow-x-auto scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'profile'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <User className="size-3.5" />
          Profile & Identity
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'security'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Shield className="size-3.5" />
          Security & Password
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'sessions'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Laptop className="size-3.5" />
          Active Sessions ({sessions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('activity')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer shrink-0 ${
            activeTab === 'activity'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          <Clock className="size-3.5" />
          Security Timeline
        </button>
      </div>

      {/* TAB 1: PROFILE & IDENTITY */}
      {activeTab === 'profile' ? (
        <div className="space-y-6">
          {/* Avatar & Display Name */}
          <PageSection title="Personal Identity" description="Your personal display name and avatar picture.">
            <PagePanel>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 pb-6 border-b border-border">
                {/* Avatar circle */}
                <div className="relative group shrink-0">
                  {profile.image ? (
                    <img
                      src={profile.image}
                      alt={profile.name}
                      className="size-20 rounded-full object-cover border-2 border-border shadow-xs"
                    />
                  ) : (
                    <div className="size-20 rounded-full bg-primary/10 text-primary font-bold text-2xl flex items-center justify-center border-2 border-primary/20 shadow-xs">
                      {initials}
                    </div>
                  )}
                  {avatarUploading ? (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-xs rounded-full flex items-center justify-center">
                      <RefreshCw className="size-5 text-primary animate-spin" />
                    </div>
                  ) : null}
                </div>

                {/* Avatar upload/remove controls */}
                <div className="space-y-2">
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
                      Upload new photo
                    </Button>
                    {profile.image ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={avatarUploading}
                        onClick={() => void handleRemoveAvatar()}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Remove photo
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allowed formats: JPEG, PNG, WebP. Maximum size: 2MB. Stored securely as an optimized WebP rendition.
                  </p>
                  {avatarMessage ? (
                    <p
                      className={`text-xs font-medium ${
                        avatarMessage.type === 'success' ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {avatarMessage.text}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Display Name Form */}
              <form onSubmit={(e) => void handleUpdateProfile(e)} className="pt-6 space-y-4 max-w-lg">
                <div className="space-y-1.5">
                  <label htmlFor="account-display-name" className="text-xs font-semibold text-foreground">
                    Display name
                  </label>
                  <Input
                    id="account-display-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Your full name"
                    maxLength={100}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This is your canonical display name across Maevelle systems and team consoles.
                  </p>
                </div>

                {profileMessage ? (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      profileMessage.type === 'success'
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                  >
                    {profileMessage.text}
                  </div>
                ) : null}

                <Button type="submit" disabled={profileSaving || nameInput.trim() === profile.name}>
                  {profileSaving ? (
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

          {/* Email & Verification */}
          <PageSection
            title="Email Address & Verification"
            description="Manage your account email address and verify ownership."
          >
            <PagePanel>
              <div className="space-y-4 max-w-lg">
                <div className="p-3.5 rounded-lg border border-border bg-muted/20 flex items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      Current sign-in email
                    </span>
                    <p className="text-sm font-semibold text-foreground truncate">{profile.email}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <StatusBadge
                      status={profile.emailVerified ? 'VERIFIED' : 'UNVERIFIED'}
                      tone={profile.emailVerified ? 'success' : 'warning'}
                    />
                    {!profile.emailVerified ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendingVerification}
                        onClick={() => void handleResendVerification()}
                      >
                        {resendingVerification ? 'Sending…' : 'Resend link'}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Pending Email Change Notice */}
                {pendingEmailChange ? (
                  <div className="p-3.5 rounded-lg border border-warning/30 bg-warning/10 text-xs text-foreground space-y-2">
                    <div className="flex items-center gap-2 text-warning font-semibold">
                      <Clock className="size-4 shrink-0" />
                      <span>Pending email change in progress</span>
                    </div>
                    <p>
                      A verification link was sent to{' '}
                      <strong className="font-semibold text-foreground">{pendingEmailChange.pendingEmail}</strong>. Your
                      canonical sign-in email remains <strong>{profile.email}</strong> until the new address is verified.
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={cancellingEmailChange}
                      onClick={() => void handleCancelEmailChange()}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      {cancellingEmailChange ? 'Cancelling…' : 'Cancel email change request'}
                    </Button>
                  </div>
                ) : null}

                {/* Secure Email Change Form */}
                <div className="pt-4 border-t border-border space-y-3">
                  <strong className="text-xs font-semibold text-foreground block">Change sign-in email</strong>
                  <p className="text-[11px] text-muted-foreground">
                    Changing your sign-in email requires fresh password authentication. A verification link will be sent
                    to the new address. Your email is only switched after successful verification.
                  </p>

                  <form onSubmit={(e) => void handleRequestEmailChange(e)} className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <label htmlFor="new-email-input" className="text-xs font-medium text-foreground">
                        New email address
                      </label>
                      <Input
                        id="new-email-input"
                        type="email"
                        value={newEmailInput}
                        onChange={(e) => setNewEmailInput(e.target.value)}
                        placeholder="new-address@example.com"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="email-change-password" className="text-xs font-medium text-foreground">
                        Current password (reauthentication)
                      </label>
                      <Input
                        id="email-change-password"
                        type="password"
                        value={emailChangePassword}
                        onChange={(e) => setEmailChangePassword(e.target.value)}
                        placeholder="••••••••••••"
                        required
                      />
                    </div>

                    {emailMessage ? (
                      <div
                        className={`p-3 rounded-lg text-xs border ${
                          emailMessage.type === 'success'
                            ? 'bg-success/10 border-success/30 text-success'
                            : 'bg-destructive/10 border-destructive/30 text-destructive'
                        }`}
                      >
                        {emailMessage.text}
                      </div>
                    ) : null}

                    <Button type="submit" variant="secondary" size="sm" disabled={submittingEmailChange}>
                      {submittingEmailChange ? 'Requesting…' : 'Request email change'}
                    </Button>
                  </form>
                </div>
              </div>
            </PagePanel>
          </PageSection>

          {/* Read-Only Organization & Role Info */}
          <PageSection
            title="Organization & Access Boundaries"
            description="Operational organization assignment and access permissions."
          >
            <PagePanel>
              <div className="space-y-4 max-w-xl">
                <div className="flex items-start gap-3">
                  <Building2 className="size-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {membership ? membership.organizationName : 'Independent Account'}
                      </span>
                      {membership ? (
                        <StatusBadge status={membership.status} tone={membership.status === 'ACTIVE' ? 'success' : 'warning'} />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Membership Type:{' '}
                      <strong className="text-foreground font-semibold">
                        {membership ? membership.membershipType : 'Individual'}
                      </strong>
                    </p>
                    {membership?.joinedAt ? (
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        Member since: {new Date(membership.joinedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="pt-3 border-t border-border/60 text-[11px] text-muted-foreground">
                  <p>
                    <strong>Security notice:</strong> Your role, permissions, and membership status are administrative
                    controls governed by Team & Access. They cannot be altered through self-service profile updates.
                  </p>
                </div>
              </div>
            </PagePanel>
          </PageSection>
        </div>
      ) : null}

      {/* TAB 2: SECURITY & PASSWORD */}
      {activeTab === 'security' ? (
        <div className="space-y-6">
          {/* Two-Factor Authentication Status */}
          <PageSection
            title="Two-Factor Authentication (2FA)"
            description="Manage your time-based one-time password (TOTP) authenticator and recovery codes."
          >
            <PagePanel>
              <div className="max-w-xl space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {security.twoFactorEnabled ? (
                      <ShieldCheck className="size-5 text-success shrink-0 mt-0.5" />
                    ) : (
                      <ShieldAlert className="size-5 text-warning shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <strong className="text-xs font-semibold text-foreground block">
                        Authenticator App Protection
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {security.twoFactorEnabled
                          ? 'Your account is secured with a standard TOTP authenticator app and backup recovery codes.'
                          : 'Two-factor authentication is not yet configured for your personal account.'}
                      </p>
                      {security.twoFactorRequired ? (
                        <span className="inline-block mt-1 text-[11px] font-semibold text-warning bg-warning/10 border border-warning/20 px-2 py-0.5 rounded">
                          Required by Maevelle organization policy
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <StatusBadge
                    status={security.twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                    tone={security.twoFactorEnabled ? 'success' : 'warning'}
                  />
                </div>

                <div className="pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Use the dedicated security console to pair an authenticator app or regenerate recovery codes.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/account/security')}
                  >
                    Open 2FA Console →
                  </Button>
                </div>
              </div>
            </PagePanel>
          </PageSection>

          {/* Change Password */}
          <PageSection
            title="Change Account Password"
            description="Update your credentials. For security, other active sessions are revoked by default."
          >
            <PagePanel>
              <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-4 max-w-lg">
                <div className="space-y-1">
                  <label htmlFor="current-pwd" className="text-xs font-semibold text-foreground">
                    Current password
                  </label>
                  <Input
                    id="current-pwd"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="new-pwd" className="text-xs font-semibold text-foreground">
                    New password (minimum 12 characters)
                  </label>
                  <Input
                    id="new-pwd"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    minLength={12}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="confirm-pwd" className="text-xs font-semibold text-foreground">
                    Confirm new password
                  </label>
                  <Input
                    id="confirm-pwd"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    minLength={12}
                    required
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Checkbox
                    id="revoke-others"
                    checked={revokeOtherSessions}
                    onCheckedChange={(checked) => setRevokeOtherSessions(checked === true)}
                  />
                  <label htmlFor="revoke-others" className="text-xs text-foreground cursor-pointer select-none">
                    Sign out of all other active sessions and devices upon password change
                  </label>
                </div>

                {passwordMessage ? (
                  <div
                    className={`p-3 rounded-lg text-xs border ${
                      passwordMessage.type === 'success'
                        ? 'bg-success/10 border-success/30 text-success'
                        : 'bg-destructive/10 border-destructive/30 text-destructive'
                    }`}
                  >
                    {passwordMessage.text}
                  </div>
                ) : null}

                <Button type="submit" disabled={submittingPassword}>
                  {submittingPassword ? (
                    <>
                      <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                      Updating password…
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>
            </PagePanel>
          </PageSection>
        </div>
      ) : null}

      {/* TAB 3: ACTIVE SESSIONS */}
      {activeTab === 'sessions' ? (
        <div className="space-y-6">
          <PageSection
            title="Active Login Sessions"
            description="Inspect devices and browsers currently signed in to your Maevelle account."
          >
            <PagePanel>
              {sessionMessage ? (
                <div
                  className={`p-3 rounded-lg text-xs border mb-4 ${
                    sessionMessage.type === 'success'
                      ? 'bg-success/10 border-success/30 text-success'
                      : 'bg-destructive/10 border-destructive/30 text-destructive'
                  }`}
                >
                  {sessionMessage.text}
                </div>
              ) : null}

              {/* Session Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
                <span className="text-xs text-muted-foreground">
                  Total active sessions:{' '}
                  <strong className="text-foreground tabular-nums font-semibold">{sessions.length}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={revokingOthers || sessions.length <= 1}
                    onClick={() => void handleRevokeOtherSessions()}
                  >
                    {revokingOthers ? 'Revoking…' : 'Sign out other devices'}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={revokingAll}
                    onClick={() => void handleSignOutEverywhere()}
                  >
                    {revokingAll ? 'Signing out…' : 'Sign out everywhere'}
                  </Button>
                </div>
              </div>

              {/* Sessions Table */}
              <div className="divide-y divide-border/60">
                {sessions.map((item) => (
                  <div
                    key={item.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0 mt-0.5">
                        <Laptop className="size-4" />
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-semibold text-foreground">{item.deviceLabel}</strong>
                          {item.isCurrent ? (
                            <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded">
                              This device
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          {item.ipAddress ? (
                            <span className="font-mono tabular-nums">IP: {item.ipAddress}</span>
                          ) : null}
                          {item.createdAt ? (
                            <span className="tabular-nums">
                              Signed in:{' '}
                              {new Date(item.createdAt).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {!item.isCurrent ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={revokingSessionId === item.id}
                        onClick={() => void handleRevokeSession(item.id)}
                        className="text-destructive hover:bg-destructive/10 self-start sm:self-center"
                      >
                        {revokingSessionId === item.id ? 'Revoking…' : 'Sign out'}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </PagePanel>
          </PageSection>
        </div>
      ) : null}

      {/* TAB 4: SECURITY TIMELINE */}
      {activeTab === 'activity' ? (
        <div className="space-y-6">
          <PageSection
            title="Account Security Activity"
            description="Recent security-sensitive events associated with your personal Maevelle account."
          >
            <PagePanel>
              {activities.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No recent security activity recorded.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {activities.map((act) => (
                    <div key={act.id} className="py-3 flex items-start gap-3">
                      <div className="p-1.5 rounded-full bg-primary/10 text-primary shrink-0 mt-0.5">
                        <Shield className="size-3.5" />
                      </div>
                      <div className="flex-1 space-y-0.5 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="text-xs font-semibold text-foreground capitalize">
                            {act.title || act.action.replace(/_/g, ' ')}
                          </strong>
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                            {new Date(act.occurredAt).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{act.description}</p>
                        {act.ipAddress ? (
                          <span className="text-[10px] font-mono text-muted-foreground tabular-nums block">
                            Origin: {act.ipAddress}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </PagePanel>
          </PageSection>
        </div>
      ) : null}
    </AdminPage>
  );
}
