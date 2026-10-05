import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { StatusBadge } from '../components/status-badge';
import { TotpCodeInput } from '../components/security/totp-code-input';
import { RecoveryCodesPanel } from '../components/security/recovery-codes-panel';
import { TwoFactorRequiredGate } from '../components/security/two-factor-required-gate';
import type { AdminContextDto } from '@maevelle/contracts';

describe('Two-Factor Authentication Frontend Components', () => {
  describe('StatusBadge for 2FA Posture', () => {
    it('renders enabled 2FA with success tone and text', () => {
      const html = renderToStaticMarkup(<StatusBadge status="Enabled" tone="success" />);
      expect(html).toContain('enabled');
      expect(html).toContain('bg-emerald');
    });

    it('renders required 2FA with warning tone and text', () => {
      const html = renderToStaticMarkup(<StatusBadge status="Required" tone="warning" />);
      expect(html).toContain('required');
      expect(html).toContain('bg-amber');
    });

    it('renders unconfigured 2FA with neutral tone and text', () => {
      const html = renderToStaticMarkup(<StatusBadge status="Not enabled" tone="neutral" />);
      expect(html).toContain('not enabled');
      expect(html).toContain('bg-slate');
    });
  });

  describe('TotpCodeInput', () => {
    it('renders 6 OTP slots with separator', () => {
      const html = renderToStaticMarkup(
        <TotpCodeInput
          value="123"
          onChange={() => {}}
          autoFocus={false}
        />,
      );
      expect(html).toContain('input-otp');
      // Contains two groups of 3 slots
      expect(html).toContain('input-otp-separator');
    });
  });

  describe('RecoveryCodesPanel', () => {
    const sampleCodes = ['ABCD-EFGH', 'IJKL-MNOP', 'QRST-UVWX', 'YZ12-3456'];

    it('renders all recovery codes in monospace tabular format', () => {
      const html = renderToStaticMarkup(
        <RecoveryCodesPanel
          codes={sampleCodes}
          userEmail="operator@maevelle.com"
          requireAcknowledgement={true}
        />,
      );

      for (const code of sampleCodes) {
        expect(html).toContain(code);
      }
      expect(html).toContain('Save your recovery codes');
      expect(html).toContain('Each code can only be used once');
      expect(html).toContain('Copy all codes');
      expect(html).toContain('Download text file');
      expect(html).toContain('I have saved these recovery codes');
    });
  });

  describe('TwoFactorRequiredGate', () => {
    const mockRestrictedContext: AdminContextDto = {
      actorId: 'user-1',
      organizationId: 'org-1',
      membershipId: 'mem-1',
      membershipType: 'STANDARD',
      capabilities: ['orders.view'],
      scopes: [],
      twoFactor: {
        isEnabled: false,
        isRequired: true,
        enrollmentRequired: true,
        accessRestricted: true,
        enrollmentDeadline: '2026-10-15T00:00:00.000Z',
      },
    };

    it('renders blocking gate when access is restricted', () => {
      const html = renderToStaticMarkup(
        <TwoFactorRequiredGate context={mockRestrictedContext} />,
      );

      expect(html).toContain('Two-factor authentication is required');
      expect(html).toContain('Set up authenticator now');
      expect(html).toContain('Sign out of Maevelle');
      // Ensure no protected navigation or child content is leaked
      expect(html).not.toContain('Dashboard');
      expect(html).not.toContain('Stocktakes');
    });
  });
});
