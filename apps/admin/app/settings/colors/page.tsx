import type { Metadata } from 'next';

import { ColorManager } from '@/components/colors';

export const metadata: Metadata = {
  title: 'Color Library | Settings | Maevelle Admin',
  description: 'Manage standardized colors, HEX codes, variant usage, and swatch lifecycle.',
};

export default function SettingsColorsPage() {
  return <ColorManager />;
}
