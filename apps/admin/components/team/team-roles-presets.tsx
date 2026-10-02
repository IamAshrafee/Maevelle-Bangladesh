'use client';

import { useMemo, useState } from 'react';
import {
  Check,
  Edit2,
  Layers,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useTeam } from './team-context';
import { TeamPermissionsEditor, type PermissionsEditorValue } from './team-permissions-editor';
import {
  formatIamErrorMessage,
  getSensitivityBadge,
  type PermissionPresetDto,
} from './team-types';

export function TeamRolesPresets({
  onRefresh,
}: {
  readonly onRefresh: () => Promise<void>;
}) {
  const { presets, capabilities, groupedDomains, canManagePermissions, request } = useTeam();
  const [catalogSearch, setCatalogSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View / Inspect Preset Dialog
  const [inspectPreset, setInspectPreset] = useState<PermissionPresetDto | null>(null);

  // Create Custom Preset Dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPermissions, setCreatePermissions] = useState<PermissionsEditorValue>({
    capabilityCodes: [],
    scopes: [],
  });

  // Edit Custom Preset Dialog
  const [editPreset, setEditPreset] = useState<PermissionPresetDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPermissions, setEditPermissions] = useState<PermissionsEditorValue>({
    capabilityCodes: [],
    scopes: [],
  });

  // Delete Custom Preset Dialog
  const [deletePreset, setDeletePreset] = useState<PermissionPresetDto | null>(null);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return groupedDomains;
    return groupedDomains
      .map((group) => ({
        domain: group.domain,
        capabilities: group.capabilities.filter(
          (c) =>
            c.capability_code.toLowerCase().includes(q) ||
            c.description.toLowerCase().includes(q) ||
            group.domain.label.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.capabilities.length > 0);
  }, [catalogSearch, groupedDomains]);

  async function handleCreatePreset(e: React.FormEvent) {
    e.preventDefault();
    if (!createName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await request('/admin/team/presets', {
        method: 'POST',
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || undefined,
          capabilityCodes: createPermissions.capabilityCodes,
        }),
      });
      setCreateOpen(false);
      setCreateName('');
      setCreateDescription('');
      setCreatePermissions({ capabilityCodes: [], scopes: [] });
      await onRefresh();
    } catch (err) {
      setError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdatePreset(e: React.FormEvent) {
    e.preventDefault();
    if (!editPreset || !editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/admin/team/presets/${editPreset.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: Number(editPreset.version ?? 1),
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          capabilityCodes: editPermissions.capabilityCodes,
        }),
      });
      setEditPreset(null);
      await onRefresh();
    } catch (err) {
      setError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePreset() {
    if (!deletePreset) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/admin/team/presets/${deletePreset.id}`, {
        method: 'DELETE',
        body: JSON.stringify({
          expectedVersion: Number(deletePreset.version ?? 1),
        }),
      });
      setDeletePreset(null);
      await onRefresh();
    } catch (err) {
      setError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {error ? (
        <div className="rounded-md bg-destructive/15 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      {/* SECTION 1: Standard & Custom Roles */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Layers className="size-5 text-primary" />
              Organizational Role Presets
            </h3>
            <p className="text-xs text-muted-foreground">
              Pre-configured capability profiles for quick assignment during invitation or member onboarding.
            </p>
          </div>
          {canManagePermissions ? (
            <Button
              type="button"
              className="button primary"
              onClick={() => {
                setCreateName('');
                setCreateDescription('');
                setCreatePermissions({ capabilityCodes: [], scopes: [] });
                setError(null);
                setCreateOpen(true);
              }}
            >
              <Plus className="size-4" /> Create custom role
            </Button>
          ) : null}
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {presets.map((preset) => {
            const isSystem = Boolean(preset.is_system_default);
            return (
              <div
                key={preset.id}
                className="rounded-lg border border-border bg-card p-5 space-y-4 flex flex-col justify-between hover:border-primary/50 transition-colors shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-base text-foreground">{preset.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {preset.description || 'No description provided.'}
                      </p>
                    </div>
                    {isSystem ? (
                      <Badge variant="secondary" className="text-[10px] shrink-0 font-medium">
                        System protected
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] shrink-0 font-medium bg-primary/15 text-primary border-primary/30">
                        Custom role
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="font-medium text-foreground">
                      <strong>{preset.capability_codes.length}</strong> capabilities
                    </span>
                    {typeof preset.member_count === 'number' ? (
                      <span className="flex items-center gap-1">
                        <Users className="size-3 text-primary" />
                        <strong>{preset.member_count}</strong> active member{preset.member_count === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </div>

                  {/* Sample Chips */}
                  <div className="flex flex-wrap gap-1 pt-2">
                    {preset.capability_codes.slice(0, 6).map((code) => (
                      <span
                        key={code}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                      >
                        {code}
                      </span>
                    ))}
                    {preset.capability_codes.length > 6 ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        +{preset.capability_codes.length - 6} more
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Role Actions */}
                <div className="flex items-center justify-between pt-3 border-t border-border/60">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={() => setInspectPreset(preset)}
                  >
                    View capabilities
                  </Button>

                  {!isSystem && canManagePermissions ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs px-2"
                        onClick={() => {
                          setEditPreset(preset);
                          setEditName(preset.name);
                          setEditDescription(preset.description || '');
                          setEditPermissions({
                            capabilityCodes: [...preset.capability_codes],
                            scopes: [],
                          });
                          setError(null);
                        }}
                      >
                        <Edit2 className="size-3 mr-1" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletePreset(preset)}
                      >
                        <Trash2 className="size-3 mr-1" /> Delete
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2: Full System Capability Catalog Explorer */}
      <div className="space-y-4 pt-4 border-t border-border">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              Complete Capability Catalog ({capabilities.length} capabilities)
            </h3>
            <p className="text-xs text-muted-foreground">
              Reference guide for all fine-grained server capabilities across Maevelle business domains.
            </p>
          </div>
          <div className="relative max-w-xs w-full">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
            <Input
              placeholder="Search catalog…"
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-4">
          {filteredCatalog.map(({ domain, capabilities: domainCaps }) => {
            const DomainIcon = domain.icon;
            return (
              <div key={domain.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <DomainIcon className="size-4 text-primary" />
                  <h4 className="font-semibold text-sm text-foreground">{domain.label}</h4>
                  <span className="text-xs text-muted-foreground">({domainCaps.length} capabilities)</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {domainCaps.map((cap) => {
                    const badge = getSensitivityBadge(cap.sensitivity);
                    return (
                      <div
                        key={cap.capability_code}
                        className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-foreground text-[11px]">
                            {cap.capability_code}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] py-0 px-1 font-normal ${badge.className}`}
                          >
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground text-[11px] leading-relaxed">
                          {cap.description}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Inspect Preset Dialog */}
      {inspectPreset ? (
        <Dialog open={true} onOpenChange={(open) => !open && setInspectPreset(null)}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="size-5 text-primary" />
                {inspectPreset.name}
              </DialogTitle>
              <DialogDescription>{inspectPreset.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Total capabilities: <strong>{inspectPreset.capability_codes.length}</strong>
                </span>
                {inspectPreset.is_system_default ? (
                  <Badge variant="secondary" className="text-[10px]">
                    System default profile
                  </Badge>
                ) : (
                  <Badge className="text-[10px] bg-primary/15 text-primary">Custom preset</Badge>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto rounded-md border border-border p-2 space-y-1 bg-muted/20">
                {inspectPreset.capability_codes.map((code) => {
                  const def = capabilities.find((c) => c.capability_code === code);
                  return (
                    <div
                      key={code}
                      className="p-2 rounded hover:bg-background text-xs space-y-0.5"
                    >
                      <div className="font-mono font-semibold text-foreground">{code}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {def?.description ?? 'Organization capability'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setInspectPreset(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Create Custom Role Dialog */}
      {createOpen ? (
        <Dialog open={true} onOpenChange={(open) => !open && setCreateOpen(false)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="size-5 text-primary" />
                Create Custom Role Preset
              </DialogTitle>
              <DialogDescription>
                Define a reusable bundle of capabilities for your organization.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreatePreset} className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="create-role-name">Role Name</Label>
                  <Input
                    id="create-role-name"
                    required
                    maxLength={120}
                    placeholder="e.g. Regional Merchandiser"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="create-role-desc">Description</Label>
                  <Input
                    id="create-role-desc"
                    maxLength={500}
                    placeholder="e.g. Manages catalog, categories, and promotions"
                    value={createDescription}
                    onChange={(e) => setCreateDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Included Capabilities ({createPermissions.capabilityCodes.length})</Label>
                <TeamPermissionsEditor
                  value={createPermissions}
                  onChange={setCreatePermissions}
                  showPresetSelector={false}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !createName.trim() || createPermissions.capabilityCodes.length === 0}
                >
                  {busy ? 'Creating…' : 'Create Role Preset'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Edit Custom Role Dialog */}
      {editPreset ? (
        <Dialog open={true} onOpenChange={(open) => !open && setEditPreset(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="size-5 text-primary" />
                Edit Role Preset: {editPreset.name}
              </DialogTitle>
              <DialogDescription>
                Update role name, description, and assigned capabilities.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUpdatePreset} className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit-role-name">Role Name</Label>
                  <Input
                    id="edit-role-name"
                    required
                    maxLength={120}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-role-desc">Description</Label>
                  <Input
                    id="edit-role-desc"
                    maxLength={500}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Included Capabilities ({editPermissions.capabilityCodes.length})</Label>
                <TeamPermissionsEditor
                  value={editPermissions}
                  onChange={setEditPermissions}
                  showPresetSelector={false}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setEditPreset(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !editName.trim() || editPermissions.capabilityCodes.length === 0}
                >
                  {busy ? 'Saving…' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Delete Custom Role Confirmation */}
      {deletePreset ? (
        <Dialog open={true} onOpenChange={(open) => !open && setDeletePreset(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="size-5" />
                Delete Role Preset
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete the role preset <strong>{deletePreset.name}</strong>?
                Existing members who have these capabilities will keep their access, but this preset
                will no longer be available for selection.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setDeletePreset(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeletePreset}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete preset'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
