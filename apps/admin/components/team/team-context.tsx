'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAdminContext, type AdminUserContext } from '../admin-capabilities';
import {
  groupCapabilitiesByDomain,
  type CapabilityCatalogItemDto,
  type DomainMeta,
  type PermissionPresetDto,
  type TeamLocationOptionDto,
} from './team-types';

export interface TeamContextValue {
  readonly activeActor: AdminUserContext;
  readonly canInvite: boolean;
  readonly canManagePermissions: boolean;
  readonly canManageLifecycle: boolean;
  readonly canTransferOwnership: boolean;
  readonly canRevokeSessions: boolean;
  readonly isReadOnly: boolean;
  readonly capabilities: readonly CapabilityCatalogItemDto[];
  readonly groupedDomains: readonly {
    readonly domain: DomainMeta;
    readonly capabilities: readonly CapabilityCatalogItemDto[];
  }[];
  readonly presets: readonly PermissionPresetDto[];
  readonly locations: readonly TeamLocationOptionDto[];
  readonly loadingMetadata: boolean;
  readonly metadataError: string | null;
  readonly reloadMetadata: () => Promise<void>;
  readonly request: <T>(path: string, init?: RequestInit) => Promise<T>;
}

const TeamContextInstance = createContext<TeamContextValue | null>(null);

export async function teamApiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { code?: string; message?: string };
    };
    const errorMessage =
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? `Request failed with status ${response.status}`);
    const error = new Error(errorMessage);
    if (typeof payload.error === 'object' && payload.error?.code) {
      (error as Error & { code?: string }).code = payload.error.code;
    }
    throw error;
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

export function TeamProvider({ children }: { readonly children: ReactNode }) {
  const activeActor = useAdminContext();
  const [capabilities, setCapabilities] = useState<readonly CapabilityCatalogItemDto[]>([]);
  const [presets, setPresets] = useState<readonly PermissionPresetDto[]>([]);
  const [locations, setLocations] = useState<readonly TeamLocationOptionDto[]>([]);
  const [loadingMetadata, setLoadingMetadata] = useState(true);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const canInvite = activeActor.isOwner || activeActor.capabilities.includes('admin.team.invite');
  const canManagePermissions =
    activeActor.isOwner || activeActor.capabilities.includes('admin.team.permissions.manage');
  const canManageLifecycle =
    activeActor.isOwner || activeActor.capabilities.includes('admin.team.lifecycle.manage');
  const canTransferOwnership = activeActor.isOwner;
  const canRevokeSessions =
    activeActor.isOwner || activeActor.capabilities.includes('admin.team.sessions.revoke');
  const isReadOnly =
    !canInvite && !canManagePermissions && !canManageLifecycle && !canTransferOwnership;

  const reloadMetadata = useCallback(async () => {
    setLoadingMetadata(true);
    setMetadataError(null);
    try {
      const [capabilitiesRes, presetsRes, locationsRes] = await Promise.all([
        teamApiRequest<{ data: readonly CapabilityCatalogItemDto[] }>('/admin/team/capabilities'),
        teamApiRequest<{ data: readonly PermissionPresetDto[] }>('/admin/team/presets'),
        teamApiRequest<{ data: readonly TeamLocationOptionDto[] }>('/admin/team/locations').catch(
          () => ({ data: [] as readonly TeamLocationOptionDto[] }),
        ),
      ]);
      setCapabilities(capabilitiesRes.data);
      setPresets(presetsRes.data);
      setLocations(locationsRes.data);
    } catch (err) {
      setMetadataError(err instanceof Error ? err.message : 'Failed to load team metadata.');
    } finally {
      setLoadingMetadata(false);
    }
  }, []);

  useEffect(() => {
    void reloadMetadata();
  }, [reloadMetadata]);

  const groupedDomains = useMemo(
    () => groupCapabilitiesByDomain(capabilities),
    [capabilities],
  );

  const value: TeamContextValue = useMemo(
    () => ({
      activeActor,
      canInvite,
      canManagePermissions,
      canManageLifecycle,
      canTransferOwnership,
      canRevokeSessions,
      isReadOnly,
      capabilities,
      groupedDomains,
      presets,
      locations,
      loadingMetadata,
      metadataError,
      reloadMetadata,
      request: teamApiRequest,
    }),
    [
      activeActor,
      canInvite,
      canManagePermissions,
      canManageLifecycle,
      canTransferOwnership,
      canRevokeSessions,
      isReadOnly,
      capabilities,
      groupedDomains,
      presets,
      locations,
      loadingMetadata,
      metadataError,
      reloadMetadata,
    ],
  );

  return <TeamContextInstance.Provider value={value}>{children}</TeamContextInstance.Provider>;
}

export function useTeam(): TeamContextValue {
  const context = useContext(TeamContextInstance);
  if (!context) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
