import type { Metadata } from 'next';
import { SettingsNav } from '@/components/settings/settings-nav';
import { DesignSystemView } from '@/components/design-system/design-system-view';

export const metadata: Metadata = {
  title: 'Design System · Maevelle Admin',
  description: 'Authoritative operational UI primitives, semantic tokens, and interaction guidelines for Maevelle Admin.',
};

export default function SettingsDesignSystemPage() {
  return (
    <div className="space-y-6 pb-20 max-w-6xl">
      <SettingsNav />
      <DesignSystemView />
    </div>
  );
}
