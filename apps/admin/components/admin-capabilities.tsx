'use client';

import { createContext, createElement, useContext, type ReactNode } from 'react';

const AdminCapabilitiesContext = createContext<readonly string[]>([]);

export function AdminCapabilitiesProvider({
  capabilities,
  children,
}: {
  capabilities: readonly string[];
  children: ReactNode;
}) {
  return createElement(AdminCapabilitiesContext.Provider, { value: capabilities }, children);
}

export function useAdminCapability(capability: string): boolean {
  return useContext(AdminCapabilitiesContext).includes(capability);
}
