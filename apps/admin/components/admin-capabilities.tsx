'use client';

import * as React from 'react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AdminContextDto } from '@maevelle/contracts';

export type AdminUserContext = AdminContextDto & {
  readonly isOwner: boolean;
};

const defaultContext: AdminUserContext = {
  actorId: '',
  organizationId: '',
  membershipId: '',
  membershipType: 'STANDARD',
  capabilities: [],
  scopes: [],
  twoFactor: {
    isEnabled: false,
    isRequired: false,
    enrollmentRequired: false,
    accessRestricted: false,
    enrollmentDeadline: null,
  },
  isOwner: false,
};

const AdminCapabilitiesContext = createContext<readonly string[]>([]);
const AdminUserContextInstance = createContext<AdminUserContext>(defaultContext);

export function AdminCapabilitiesProvider({
  capabilities,
  context,
  children,
}: {
  capabilities?: readonly string[] | undefined;
  context?: Partial<AdminContextDto> | undefined;
  children: ReactNode;
}) {
  const effectiveCapabilities = capabilities ?? context?.capabilities ?? [];
  const fullContext: AdminUserContext = useMemo(
    () => ({
      actorId: context?.actorId ?? '',
      organizationId: context?.organizationId ?? '',
      membershipId: context?.membershipId ?? '',
      membershipType: context?.membershipType ?? 'STANDARD',
      capabilities: effectiveCapabilities,
      scopes: context?.scopes ?? [],
      twoFactor: context?.twoFactor ?? defaultContext.twoFactor,
      isOwner: context?.membershipType === 'OWNER',
    }),
    [context, effectiveCapabilities],
  );

  return (
    <AdminCapabilitiesContext.Provider value={effectiveCapabilities}>
      <AdminUserContextInstance.Provider value={fullContext}>
        {children}
      </AdminUserContextInstance.Provider>
    </AdminCapabilitiesContext.Provider>
  );
}

export function useAdminCapability(capability: string): boolean {
  return useContext(AdminCapabilitiesContext).includes(capability);
}

export function useAdminContext(): AdminUserContext {
  return useContext(AdminUserContextInstance);
}
