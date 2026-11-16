import type { Metadata } from 'next';
import { EmailSettingsTab } from '@/components/email/email-settings-tab';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Email Settings · Maevelle Admin',
  description: 'Transactional email provider configuration, sender identity, and testing rules.',
};

export default function EmailSettingsRoutePage() {
  return (
    <AdminPage variant="standard">
      <PageHeader
        breadcrumbs={[{ label: 'Email Operations', href: '/email' }, { label: 'Settings' }]}
        eyebrow="Communications & Dispatch"
        title="Email Provider & Sending Settings"
        description="Transactional email provider configuration, sender identity, and testing rules."
      />
      <EmailSettingsTab />
    </AdminPage>
  );
}
