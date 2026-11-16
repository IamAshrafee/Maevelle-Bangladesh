import type { Metadata } from 'next';
import { SettingsNav } from '@/components/settings/settings-nav';
import { DesignSystemView } from '@/components/design-system/design-system-view';

export const metadata: Metadata = {
  title: 'Design System · Maevelle Admin',
  description:
    'Authoritative operational UI primitives, semantic tokens, and interaction guidelines for Maevelle Admin.',
};

export default function SettingsDesignSystemPage() {
  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6 lg:px-8">
        <SettingsNav />
      </div>
      <DesignSystemView />
    </>
  );
}
