'use client';

import { usePathname, useRouter } from 'next/navigation';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';

type QualityRoute = '/inventory/units' | '/inventory/units/repairs';

const QUALITY_TABS: readonly WorkspaceTabItem<QualityRoute>[] = [
  { value: '/inventory/units', label: 'Physical units', icon: 'boxes' },
  { value: '/inventory/units/repairs', label: 'Repair queue', icon: 'settings' },
];

export function QualityWorkspaceTabs() {
  const pathname = usePathname() ?? '/inventory/units';
  const router = useRouter();
  const activeRoute: QualityRoute = pathname.startsWith('/inventory/units/repairs')
    ? '/inventory/units/repairs'
    : '/inventory/units';

  return (
    <WorkspaceTabs
      items={QUALITY_TABS}
      value={activeRoute}
      onValueChange={(href) => router.push(href)}
      ariaLabel="Quality views"
      variant="pill"
    />
  );
}
