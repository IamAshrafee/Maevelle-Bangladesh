import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type {
  AccountSecurityActivityItemDto,
  AccountSessionItemDto,
  UserAccountOverviewDto,
} from '@maevelle/contracts';

import {
  formatDateTime,
  formatRelativeTime,
  getAccountErrorMessage,
  getDeviceCategoryIcon,
  getInitials,
} from '../components/account/account-utils';
import { AccountIdentityHeader } from '../components/account/account-identity-header';
import { ProfileTab } from '../components/account/profile-tab';
import { SecurityTab } from '../components/account/security-tab';
import { SessionsTab } from '../components/account/sessions-tab';
import { SecurityActivityTab } from '../components/account/security-activity-tab';
import { UserMenu } from '../components/user-menu';

// Mock Next.js navigation hooks
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/account',
  useSearchParams: () => new URLSearchParams(),
}));

const mockOverview: UserAccountOverviewDto = {
  profile: {
    id: 'user-kabir-123',
    name: 'Md. Kabir Hasan',
    email: 'kabir@maevelle.com',
    emailVerified: true,
    image: null,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-10-01T12:00:00.000Z',
  },
  membership: {
    organizationId: 'org-bd-1',
    organizationName: 'Maevelle Bangladesh',
    membershipId: 'mem-1',
    membershipType: 'OWNER',
    status: 'ACTIVE',
    joinedAt: '2026-09-01T10:00:00.000Z',
  },
  security: {
    hasPassword: true,
    twoFactorEnabled: true,
    twoFactorRequired: true,
    enrollmentRequired: false,
    accessRestricted: false,
    enrollmentDeadline: null,
    activeSessionsCount: 3,
  },
};

const mockSessions: readonly AccountSessionItemDto[] = [
  {
    id: 'sess-current',
    isCurrent: true,
    ipAddress: '103.114.98.42',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0',
    deviceLabel: 'Chrome on Windows',
    createdAt: '2026-10-05T08:00:00.000Z',
    expiresAt: '2026-10-12T08:00:00.000Z',
    lastActivityAt: '2026-10-05T09:15:00.000Z',
  },
  {
    id: 'sess-mobile',
    isCurrent: false,
    ipAddress: '103.114.98.88',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
    deviceLabel: 'Safari on iPhone',
    createdAt: '2026-10-04T14:30:00.000Z',
    expiresAt: '2026-10-11T14:30:00.000Z',
    lastActivityAt: '2026-10-04T15:00:00.000Z',
  },
];

const mockActivities: readonly AccountSecurityActivityItemDto[] = [
  {
    id: 'act-1',
    action: 'password_updated',
    title: 'Password updated',
    description: 'Account credential password changed and other active sessions revoked.',
    occurredAt: '2026-10-05T08:30:00.000Z',
    ipAddress: '103.114.98.42',
  },
  {
    id: 'act-2',
    action: 'two_factor_enabled',
    title: 'Two-factor authentication enabled',
    description: 'Authenticator app paired and recovery codes acknowledged.',
    occurredAt: '2026-10-01T12:00:00.000Z',
    ipAddress: '103.114.98.42',
  },
];

describe('My Account / Self-Service Account Frontend', () => {
  describe('account-utils', () => {
    it('generates initials correctly for multi-word and single names', () => {
      expect(getInitials('Md. Kabir Hasan')).toBe('MH');
      expect(getInitials('Rahim Ahmed')).toBe('RA');
      expect(getInitials('Fatima')).toBe('F');
      expect(getInitials('')).toBe('');
      expect(getInitials('   ')).toBe('');
      expect(getInitials(null)).toBe('');
    });

    it('maps device categories to appropriate icon components', () => {
      expect(getDeviceCategoryIcon('mobile')).toBeDefined();
      expect(getDeviceCategoryIcon('tablet')).toBeDefined();
      expect(getDeviceCategoryIcon('desktop')).toBeDefined();
      expect(getDeviceCategoryIcon('laptop')).toBeDefined();
      expect(getDeviceCategoryIcon(null)).toBeDefined();
    });

    it('translates specific API error codes into user-friendly copy', () => {
      expect(
        getAccountErrorMessage(
          { code: 'INVALID_CREDENTIALS', message: 'Raw error' },
          'Fallback',
        ),
      ).toContain('Your current password is incorrect');

      expect(
        getAccountErrorMessage(
          { code: 'AVATAR_TOO_LARGE', message: 'Raw error' },
          'Fallback',
        ),
      ).toContain('exceeds the 2MB size limit');

      expect(
        getAccountErrorMessage(
          { code: 'EMAIL_EXISTS', message: 'Raw error' },
          'Fallback',
        ),
      ).toContain('already in use');
    });

    it('formats relative and absolute timestamps cleanly', () => {
      expect(formatDateTime('2026-10-05T12:00:00.000Z')).toBeDefined();
      expect(formatRelativeTime(new Date().toISOString())).toBe('Just now');
    });
  });

  describe('AccountIdentityHeader', () => {
    it('renders user identity, badges, and organization summary', () => {
      const html = renderToStaticMarkup(
        <AccountIdentityHeader overview={mockOverview} sessionsCount={2} />,
      );

      expect(html).toContain('Md. Kabir Hasan');
      expect(html).toContain('kabir@maevelle.com');
      expect(html).toContain('Maevelle Bangladesh');
      expect(html).toContain('Owner &amp; Administrator');
      expect(html).toContain('verified');
      expect(html).toContain('2fa enabled');
      expect(html).toContain('2 active sessions');
    });

    it('renders fallback initials when user has no custom image', () => {
      const html = renderToStaticMarkup(
        <AccountIdentityHeader overview={mockOverview} sessionsCount={1} />,
      );

      expect(html).toContain('MH');
    });
  });

  describe('ProfileTab', () => {
    it('renders display name form prefilled and email status', () => {
      const html = renderToStaticMarkup(
        <ProfileTab
          overview={mockOverview}
          onOverviewChange={() => {}}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('Display name');
      expect(html).toContain('value="Md. Kabir Hasan"');
      expect(html).toContain('Save changes');
      expect(html).toContain('kabir@maevelle.com');
      expect(html).toContain('Change email');
      expect(html).toContain('Upload photo');
    });

    it('renders read-only work account information distinctly without form controls', () => {
      const html = renderToStaticMarkup(
        <ProfileTab
          overview={mockOverview}
          onOverviewChange={() => {}}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('Organization');
      expect(html).toContain('Maevelle Bangladesh');
      expect(html).toContain('Assigned Role');
      expect(html).toContain('Managed by your organization');
      // Crucial: Ensure NO disabled editable inputs exist for role or permissions
      expect(html).not.toContain('name="role"');
      expect(html).not.toContain('name="permissions"');
    });

    it('renders unverified email state and resend button when not verified', () => {
      const unverifiedOverview: UserAccountOverviewDto = {
        ...mockOverview,
        profile: {
          ...mockOverview.profile,
          emailVerified: false,
        },
      };

      const html = renderToStaticMarkup(
        <ProfileTab
          overview={unverifiedOverview}
          onOverviewChange={() => {}}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('not verified');
      expect(html).toContain('Resend verification link');
    });

    it('renders pending email change notification when in progress', () => {
      const pendingOverview: UserAccountOverviewDto = {
        ...mockOverview,
        pendingEmailChange: {
          pendingEmail: 'new-email@maevelle.com',
          requestedAt: '2026-10-05T09:00:00.000Z',
          expiresAt: '2026-10-06T09:00:00.000Z',
        },
      };

      const html = renderToStaticMarkup(
        <ProfileTab
          overview={pendingOverview}
          onOverviewChange={() => {}}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('Pending Email Change in Progress');
      expect(html).toContain('new-email@maevelle.com');
      expect(html).toContain('Cancel email change request');
    });
  });

  describe('SecurityTab', () => {
    it('renders password change form with 12-character guidance and consequence checkbox', () => {
      const html = renderToStaticMarkup(
        <SecurityTab overview={mockOverview} onReload={async () => {}} />,
      );

      expect(html).toContain('Account Password');
      expect(html).toContain('Current password');
      expect(html).toContain('New password');
      expect(html).toContain('Confirm new password');
      expect(html).toContain('Must be at least 12 characters long');
      expect(html).toContain('Sign out of all other active sessions and devices');
      expect(html).toContain('Update password');
    });

    it('renders 2FA configuration card reflecting enabled status', () => {
      const html = renderToStaticMarkup(
        <SecurityTab overview={mockOverview} onReload={async () => {}} />,
      );

      expect(html).toContain('Two-Factor Authentication (2FA)');
      expect(html).toContain('Authenticator App (TOTP)');
      expect(html).toContain('enabled');
      expect(html).toContain('Regenerate recovery codes');
      expect(html).toContain('Recovery Codes Safeguard');
    });

    it('renders setup action when 2FA is not enabled', () => {
      const unconfiguredOverview: UserAccountOverviewDto = {
        ...mockOverview,
        security: {
          ...mockOverview.security,
          twoFactorEnabled: false,
          twoFactorRequired: true,
        },
      };

      const html = renderToStaticMarkup(
        <SecurityTab overview={unconfiguredOverview} onReload={async () => {}} />,
      );

      expect(html).toContain('Set up authenticator app');
      expect(html).toContain('Maevelle organization policy requires you to configure an authenticator app');
    });
  });

  describe('SessionsTab', () => {
    it('renders active sessions list with device labels, IP, and current session badge', () => {
      const html = renderToStaticMarkup(
        <SessionsTab
          sessions={mockSessions}
          loading={false}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('Active Login Sessions');
      expect(html).toContain('Chrome on Windows');
      expect(html).toContain('This device');
      expect(html).toContain('103.114.98.42');
      expect(html).toContain('Safari on iPhone');
      expect(html).toContain('Sign out other devices');
      expect(html).toContain('Sign out everywhere');
    });

    it('renders Sign Out action for other devices while current device shows current session marker', () => {
      const html = renderToStaticMarkup(
        <SessionsTab
          sessions={mockSessions}
          loading={false}
          onReload={async () => {}}
        />,
      );

      expect(html).toContain('Current session');
      expect(html).toContain('Sign out');
    });
  });

  describe('SecurityActivityTab', () => {
    it('renders chronological security events with human-readable titles and origin IPs', () => {
      const html = renderToStaticMarkup(
        <SecurityActivityTab activities={mockActivities} loading={false} />,
      );

      expect(html).toContain('Recent Security Activity');
      expect(html).toContain('Password updated');
      expect(html).toContain('Two-factor authentication enabled');
      expect(html).toContain('Source IP: 103.114.98.42');
    });

    it('renders clean empty state when no activity is recorded', () => {
      const html = renderToStaticMarkup(
        <SecurityActivityTab activities={[]} loading={false} />,
      );

      expect(html).toContain('No recent security events');
    });
  });

  describe('UserMenu in Topbar', () => {
    it('renders user details, initials fallback, and quick links', () => {
      const mockContext = {
        actorId: 'user-kabir-123',
        organizationId: 'org-bd-1',
        membershipId: 'mem-1',
        membershipType: 'OWNER' as const,
        capabilities: ['orders.view'],
        scopes: [],
        twoFactor: {
          isEnabled: true,
          isRequired: true,
          enrollmentRequired: false,
          accessRestricted: false,
          enrollmentDeadline: null,
        },
        user: {
          name: 'Md. Kabir Hasan',
          email: 'kabir@maevelle.com',
          image: null,
        },
      };

      const html = renderToStaticMarkup(
        <UserMenu context={mockContext} onLogout={() => {}} />,
      );

      expect(html).toContain('Md. Kabir Hasan');
      expect(html).toContain('MH');
      expect(html).toContain('Owner');
      expect(html).toContain('Maevelle BD');
      expect(html).toContain('aria-label="User menu for Md. Kabir Hasan"');
      expect(html).toContain('aria-haspopup="menu"');
    });
  });

  describe('Team & Access Separation Boundary', () => {
    it('strictly guarantees My Account does not render administrative team member controls', () => {
      const profileHtml = renderToStaticMarkup(
        <ProfileTab
          overview={mockOverview}
          onOverviewChange={() => {}}
          onReload={async () => {}}
        />,
      );

      const securityHtml = renderToStaticMarkup(
        <SecurityTab overview={mockOverview} onReload={async () => {}} />,
      );

      // Verify no administrative mutation controls exist
      expect(profileHtml).not.toContain('Transfer Ownership');
      expect(profileHtml).not.toContain('Suspend Member');
      expect(profileHtml).not.toContain('Revoke Invitation');
      expect(profileHtml).not.toContain('Role Assignment');
      expect(securityHtml).not.toContain('Reset Member 2FA');
      expect(securityHtml).not.toContain('Enforce Org Policy');
    });
  });
});
