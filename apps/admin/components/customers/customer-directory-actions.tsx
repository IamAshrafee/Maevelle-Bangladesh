'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookmarkPlus, UsersRound } from 'lucide-react';
import type { CustomerTagDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';

type SavedView = {
  id: string;
  name: string;
  visibility: 'PERSONAL' | 'ORGANIZATION';
  filters: Record<string, unknown>;
};

export function CustomerDirectoryActions({
  filters,
  selectedIds,
  onApplyView,
  onBulkComplete,
}: {
  filters: Record<string, string>;
  selectedIds: readonly string[];
  onApplyView: (filters: Record<string, unknown>) => void;
  onBulkComplete: () => void;
}) {
  const [views, setViews] = useState<readonly SavedView[]>([]);
  const [tags, setTags] = useState<readonly CustomerTagDto[]>([]);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PERSONAL' | 'ORGANIZATION'>('PERSONAL');
  const [saveOpen, setSaveOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [action, setAction] = useState<'ADD_TAG' | 'REMOVE_TAG' | 'ASSIGN_OWNER'>('ADD_TAG');
  const [tagId, setTagId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canManage = useAdminCapability('customers.manage');
  const canManageRelationship = useAdminCapability('customers.relationship.manage');
  const canManageSegments = useAdminCapability('customers.segments.manage');
  useEffect(() => {
    if (!canManage && canManageRelationship) setAction('ASSIGN_OWNER');
  }, [canManage, canManageRelationship]);
  const loadMetadata = useCallback(async () => {
    try {
      const [savedViews, availableTags] = await Promise.all([
        fetchApiData<readonly SavedView[]>('/admin/crm/saved-views'),
        fetchApiData<readonly CustomerTagDto[]>('/admin/tags'),
      ]);
      setViews(savedViews);
      setTags(availableTags);
      setTagId((current) => current || availableTags[0]?.id || '');
    } catch {
      // The directory remains usable if optional saved-view metadata cannot load.
    }
  }, []);
  useEffect(() => {
    void loadMetadata();
  }, [loadMetadata]);

  async function saveView(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetchApiData('/admin/crm/saved-views', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), visibility, filters }),
      });
      setSaveOpen(false);
      setName('');
      await loadMetadata();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'View could not be saved.');
    } finally {
      setBusy(false);
    }
  }
  async function applyBulk(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await fetchApiData('/admin/crm/customers/bulk-actions', {
        method: 'POST',
        body: JSON.stringify({
          customerIds: selectedIds,
          action,
          ...(action !== 'ASSIGN_OWNER' ? { tagId } : {}),
          reason: reason.trim(),
        }),
      });
      setBulkOpen(false);
      setReason('');
      onBulkComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bulk action could not be applied.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.length ? (
        <NativeSelect
          aria-label="Saved customer view"
          defaultValue=""
          onChange={(event) => {
            const view = views.find((item) => item.id === event.target.value);
            if (view) onApplyView(view.filters);
          }}
        >
          <NativeSelectOption value="" disabled>
            Saved views
          </NativeSelectOption>
          {views.map((view) => (
            <NativeSelectOption key={view.id} value={view.id}>
              {view.name} · {view.visibility.toLowerCase()}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogTrigger render={<Button size="sm" variant="outline" />}>
          <BookmarkPlus className="size-4" /> Save view
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current customer view</DialogTitle>
            <DialogDescription>
              Preserve the current filters for repeatable operational work.
            </DialogDescription>
          </DialogHeader>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <form className="space-y-4" onSubmit={saveView}>
            <div className="space-y-2">
              <Label htmlFor="saved-view-name">Name</Label>
              <Input
                id="saved-view-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="saved-view-visibility">Visibility</Label>
              <NativeSelect
                id="saved-view-visibility"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as typeof visibility)}
              >
                <NativeSelectOption value="PERSONAL">Personal</NativeSelectOption>
                {canManageSegments ? (
                  <NativeSelectOption value="ORGANIZATION">Organization</NativeSelectOption>
                ) : null}
              </NativeSelect>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSaveOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Saving…' : 'Save view'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {selectedIds.length && (canManage || canManageRelationship) ? (
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" />}>
            <UsersRound className="size-4" /> Bulk action ({selectedIds.length})
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update {selectedIds.length} customers</DialogTitle>
              <DialogDescription>
                Each eligible profile is locked and updated atomically; failures are reported
                without crossing organization boundaries.
              </DialogDescription>
            </DialogHeader>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <form className="space-y-4" onSubmit={applyBulk}>
              <div className="space-y-2">
                <Label htmlFor="bulk-action">Action</Label>
                <NativeSelect
                  id="bulk-action"
                  value={action}
                  onChange={(event) => setAction(event.target.value as typeof action)}
                >
                  {canManage ? (
                    <>
                      <NativeSelectOption value="ADD_TAG">Add tag</NativeSelectOption>
                      <NativeSelectOption value="REMOVE_TAG">Remove tag</NativeSelectOption>
                    </>
                  ) : null}
                  {canManageRelationship ? (
                    <NativeSelectOption value="ASSIGN_OWNER">Assign to me</NativeSelectOption>
                  ) : null}
                </NativeSelect>
              </div>
              {action !== 'ASSIGN_OWNER' ? (
                <div className="space-y-2">
                  <Label htmlFor="bulk-tag">Tag</Label>
                  <NativeSelect
                    id="bulk-tag"
                    value={tagId}
                    onChange={(event) => setTagId(event.target.value)}
                  >
                    {tags.map((tag) => (
                      <NativeSelectOption key={tag.id} value={tag.id}>
                        {tag.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="bulk-reason">Auditable reason</Label>
                <Textarea
                  id="bulk-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setBulkOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !reason.trim() || (action !== 'ASSIGN_OWNER' && !tagId)}
                >
                  {busy ? 'Applying…' : 'Apply action'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
