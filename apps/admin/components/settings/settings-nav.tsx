'use client';

import { ModuleNav } from '@/components/ui/module-nav';

/**
 * Compatibility wrapper preserving existing `<SettingsNav />` imports across
 * Settings sub-pages (including `/settings/checkout` and `/settings/design-system`)
 * while delegating routing, capability/owner gating, and responsive overflow to
 * the centralized `ModuleNav` + `route-registry.ts` contract.
 */
export function SettingsNav({ className }: { readonly className?: string }) {
  return (
    <ModuleNav
      moduleId="settings"
      ariaLabel="Settings navigation"
      {...(className ? { className } : {})}
    />
  );
}
