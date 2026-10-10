import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UserMenu } from '../components/user-menu';
import AccountPage from '../app/account/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account',
  useSearchParams: () => new URLSearchParams(),
}));

describe('UserMenu & Account Page Resilience', () => {
  it('renders UserMenu trigger with operator name, initials, and role', () => {
    const html = renderToStaticMarkup(
      <UserMenu
        context={{
          user: { id: 'u1', name: 'Maevelle Bangladesh', email: 'owner@maevelle.com', image: null },
          organization: { id: 'o1', name: 'Maevelle BD', slug: 'bd' },
          membershipType: 'OWNER',
          capabilities: [],
          twoFactor: { isEnabled: true, required: true, enrollmentRequired: false, enrollmentDeadline: null, accessRestricted: false },
        } as any}
        onLogout={() => {}}
      />,
    );

    expect(html).toContain('Maevelle Bangladesh');
    expect(html).toContain('Owner · Maevelle BD');
    expect(html).toContain('MB');
  });

  it('renders AccountPage server component successfully', () => {
    const html = renderToStaticMarkup(<AccountPage />);
    expect(html).toContain('Loading your account profile and credentials');
  });
});
