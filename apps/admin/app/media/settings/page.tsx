import type { Metadata } from 'next';
import { MediaSettingsConsole } from '@/components/media/media-settings-console';

export const metadata: Metadata = {
  title: 'Media Settings · Maevelle Admin',
  description: 'Manage file upload limits, session expiry, and cloud storage policies.',
};

export default function MediaSettingsPage() {
  return <MediaSettingsConsole />;
}
