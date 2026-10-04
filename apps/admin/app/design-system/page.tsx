import type { Metadata } from 'next';
import { DesignSystemView } from '@/components/design-system/design-system-view';

export const metadata: Metadata = {
  title: 'Design System Lab · Maevelle Admin',
  description: 'Authoritative operational UI primitives, semantic tokens, and interaction guidelines for Maevelle Admin.',
};

export default function DesignSystemPage() {
  return <DesignSystemView />;
}
