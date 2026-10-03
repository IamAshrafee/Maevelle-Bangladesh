'use client';

import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  MapPin,
  Search,
  Shield,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import { useTeam } from './team-context';
import {
  getSensitivityBadge,
  type AccessScopeDto,
  type CapabilityCatalogItemDto,
  type DomainMeta,
} from './team-types';

export interface PermissionsEditorValue {
  readonly capabilityCodes: readonly string[];
  readonly scopes: readonly AccessScopeDto[];
}

export function TeamPermissionsEditor({
  value,
  onChange,
  readOnly = false,
  showPresetSelector = true,
  maxHeightClassName = 'max-h-[500px]',
}: {
  readonly value: PermissionsEditorValue;
  readonly onChange: (next: PermissionsEditorValue) => void;
  readonly readOnly?: boolean;
  readonly showPresetSelector?: boolean;
  readonly maxHeightClassName?: string;
}) {
  const { groupedDomains, presets, locations } = useTeam();
  const [search, setSearch] = useState('');
  const [openDomains, setOpenDomains] = useState<Record<string, boolean>>({});

  const toggleDomain = (domainId: string) => {
    setOpenDomains((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
  };

  const handleApplyPreset = (presetId: string) => {
    const preset = presets.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    // Retain scopes for capabilities that are still included
    const activeCodeSet = new Set(preset.capability_codes);
    const nextScopes = value.scopes.filter((scope) => activeCodeSet.has(scope.capabilityCode));
    onChange({
      capabilityCodes: preset.capability_codes,
      scopes: nextScopes,
    });
  };

  const handleToggleCapability = (code: string, checked: boolean) => {
    if (readOnly) return;
    let nextCodes: string[];
    let nextScopes = [...value.scopes];

    if (checked) {
      nextCodes = [...value.capabilityCodes, code];
    } else {
      nextCodes = value.capabilityCodes.filter((c) => c !== code);
      nextScopes = nextScopes.filter((s) => s.capabilityCode !== code);
    }
    onChange({ capabilityCodes: nextCodes, scopes: nextScopes });
  };

  const handleSelectAllDomain = (
    domainCapabilities: readonly CapabilityCatalogItemDto[],
    selectAll: boolean,
  ) => {
    if (readOnly) return;
    const domainCodes = domainCapabilities.map((c) => c.capability_code);
    let nextCodes = [...value.capabilityCodes];
    let nextScopes = [...value.scopes];

    if (selectAll) {
      for (const code of domainCodes) {
        if (!nextCodes.includes(code)) {
          nextCodes.push(code);
        }
      }
    } else {
      const domainSet = new Set(domainCodes);
      nextCodes = nextCodes.filter((c) => !domainSet.has(c));
      nextScopes = nextScopes.filter((s) => !domainSet.has(s.capabilityCode));
    }
    onChange({ capabilityCodes: nextCodes, scopes: nextScopes });
  };

  const handleToggleLocationScope = (capabilityCode: string, locationId: string, checked: boolean) => {
    if (readOnly) return;
    let nextScopes: AccessScopeDto[];
    if (checked) {
      nextScopes = [
        ...value.scopes,
        { capabilityCode, scopeType: 'LOCATION', scopeId: locationId },
      ];
    } else {
      nextScopes = value.scopes.filter(
        (s) => !(s.capabilityCode === capabilityCode && s.scopeId === locationId),
      );
    }
    onChange({ capabilityCodes: value.capabilityCodes, scopes: nextScopes });
  };

  // Filter capabilities by search
  const filteredGroupedDomains = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groupedDomains;

    return groupedDomains
      .map((group) => {
        const matchingCaps = group.capabilities.filter(
          (cap) =>
            cap.capability_code.toLowerCase().includes(q) ||
            cap.description.toLowerCase().includes(q) ||
            group.domain.label.toLowerCase().includes(q),
        );
        return {
          domain: group.domain,
          capabilities: matchingCaps,
        };
      })
      .filter((group) => group.capabilities.length > 0);
  }, [groupedDomains, search]);

  const totalAssigned = value.capabilityCodes.length;

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Search + Quick Preset Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search capabilities or domains…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {showPresetSelector && !readOnly && presets.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              Apply profile:
            </span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs sm:text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyPreset(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="" disabled>
                Select preset…
              </option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} ({preset.capability_codes.length} caps)
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>
          <strong>{totalAssigned}</strong> capabilities selected
        </span>
        {value.scopes.length > 0 ? (
          <span className="flex items-center gap-1 text-primary">
            <MapPin className="size-3" />
            <strong>{value.scopes.length}</strong> location scopes configured
          </span>
        ) : null}
      </div>

      {/* Domain Groups Accordion */}
      <div
        className={cn(
          'space-y-2 overflow-y-auto pr-1 rounded-lg border border-border/70 p-2 bg-card/30',
          maxHeightClassName,
        )}
      >
        {filteredGroupedDomains.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No capabilities match your search query.
          </div>
        ) : (
          filteredGroupedDomains.map(({ domain, capabilities }) => {
            const domainCodes = capabilities.map((c) => c.capability_code);
            const assignedCount = domainCodes.filter((code) =>
              value.capabilityCodes.includes(code),
            ).length;
            const allAssigned = assignedCount === domainCodes.length && domainCodes.length > 0;
            const someAssigned = assignedCount > 0 && !allAssigned;
            const isOpen = openDomains[domain.id] ?? (search.length > 0 || assignedCount > 0);
            const DomainIcon = domain.icon;

            return (
              <div
                key={domain.id}
                className="rounded-lg border border-border/70 bg-background/80 transition-colors"
              >
                {/* Domain Header */}
                <div className="flex items-center justify-between p-3">
                  <button
                    type="button"
                    onClick={() => toggleDomain(domain.id)}
                    className="flex flex-1 items-center gap-2.5 text-left font-medium hover:text-primary transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <DomainIcon className="size-4 text-primary shrink-0" aria-hidden="true" />
                    <span className="text-sm font-semibold text-foreground">{domain.label}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {assignedCount}/{capabilities.length}
                    </span>
                  </button>

                  {!readOnly ? (
                    <div className="flex items-center gap-2 pl-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => handleSelectAllDomain(capabilities, !allAssigned)}
                      >
                        {allAssigned ? 'Deselect all' : 'Select all'}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {/* Capability Rows */}
                {isOpen ? (
                  <div className="border-t border-border/50 divide-y divide-border/30 bg-muted/20 px-3 py-2">
                    <p className="text-xs text-muted-foreground pb-2 px-1">
                      {domain.description}
                    </p>
                    {capabilities.map((capability) => {
                      const isChecked = value.capabilityCodes.includes(
                        capability.capability_code,
                      );
                      const badge = getSensitivityBadge(capability.sensitivity);
                      const supportsLocation = capability.supported_scope_types?.includes('LOCATION');
                      const activeLocationScopes = value.scopes.filter(
                        (s) => s.capabilityCode === capability.capability_code,
                      );

                      return (
                        <div key={capability.capability_code} className="py-2.5 px-1 space-y-2">
                          <label className="flex items-start gap-3 cursor-pointer group">
                            <Checkbox
                              checked={isChecked}
                              disabled={readOnly}
                              onCheckedChange={(checked) =>
                                handleToggleCapability(
                                  capability.capability_code,
                                  checked === true,
                                )
                              }
                              className="mt-0.5"
                            />
                            <div className="flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-semibold font-mono text-foreground group-hover:text-primary transition-colors">
                                  {capability.capability_code}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] py-0 px-1.5 font-normal ${badge.className}`}
                                >
                                  {badge.label}
                                </Badge>
                                {supportsLocation ? (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] py-0 px-1.5 flex items-center gap-1 font-normal bg-accent text-accent-foreground"
                                  >
                                    <MapPin className="size-2.5" />
                                    Location scoped
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {capability.description}
                              </p>
                            </div>
                          </label>

                          {/* Location Scopes Sub-Selector */}
                          {isChecked && supportsLocation && locations.length > 0 && !readOnly ? (
                            <div className="ml-7 mt-2 rounded-md border border-border/60 bg-background/90 p-2.5 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-foreground flex items-center gap-1.5">
                                  <MapPin className="size-3.5 text-primary" />
                                  Restrict to specific locations:
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {activeLocationScopes.length === 0
                                    ? 'Organization-wide access'
                                    : `${activeLocationScopes.length} location(s) allowed`}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                {locations.map((loc) => {
                                  const isScoped = activeLocationScopes.some(
                                    (s) => s.scopeId === loc.id,
                                  );
                                  return (
                                    <label
                                      key={loc.id}
                                      className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/60 cursor-pointer"
                                    >
                                      <Checkbox
                                        checked={isScoped}
                                        onCheckedChange={(c) =>
                                          handleToggleLocationScope(
                                            capability.capability_code,
                                            loc.id,
                                            c === true,
                                          )
                                        }
                                      />
                                      <span className="truncate">
                                        {loc.name} <span className="text-muted-foreground">({loc.code})</span>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <p className="text-[11px] text-muted-foreground italic">
                                Note: Leaving all locations unselected grants organization-wide access for this capability.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
