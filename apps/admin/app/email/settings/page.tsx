import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { EmailSettingsTab } from '@/components/email/email-settings-tab';

export const metadata: Metadata = {
  title: 'Email Settings · Maevelle Admin',
  description: 'Transactional email provider configuration, sender identity, and testing rules.',
};

export default function EmailSettingsRoutePage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/email" className="hover:text-foreground flex items-center gap-1">
          <Mail className="size-3.5" />
          Email Operations
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Settings</span>
      </div>
      <EmailSettingsTab />
    </div>
  );
}
