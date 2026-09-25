'use client';

import { useEffect, useState } from 'react';
import { Check, CircleAlert, Loader2, Plus, Tag as TagIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface OrgTag {
  id: string;
  label: string;
  color?: string | null;
}

export function ManageTagsDialog({
  customerId,
  assignedTags,
  onUpdated,
}: {
  readonly customerId: string;
  readonly assignedTags: readonly { id: string; label: string; color?: string | null }[];
  readonly onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState<readonly OrgTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagColor, setNewTagColor] = useState('');
  const [creating, setCreating] = useState(false);

  const assignedIds = new Set(assignedTags.map((t) => t.id));

  async function loadAllTags() {
    setLoading(true);
    try {
      const data = await fetchApiData<readonly OrgTag[]>('/admin/tags');
      setAllTags(data);
    } catch {
      // Tags might be empty or fail silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void loadAllTags();
    }
  }, [open]);

  async function toggleTag(tag: OrgTag) {
    if (busyTagId) return;
    setBusyTagId(tag.id);
    setMessage('');
    const isAssigned = assignedIds.has(tag.id);

    try {
      if (isAssigned) {
        await fetchApiData(`/admin/customers/${customerId}/tags/${tag.id}`, {
          method: 'DELETE',
        });
      } else {
        await fetchApiData(`/admin/customers/${customerId}/tags/${tag.id}`, {
          method: 'POST',
        });
      }
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update tag assignment.');
    } finally {
      setBusyTagId(null);
    }
  }

  async function handleCreateTag(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating || !newTagLabel.trim()) return;
    setCreating(true);
    setMessage('');

    try {
      const created = await fetchApiData<OrgTag>('/admin/tags', {
        method: 'POST',
        body: JSON.stringify({
          label: newTagLabel.trim(),
          ...(newTagColor.trim() ? { color: newTagColor.trim() } : {}),
        }),
      });
      // Immediately assign to this customer
      await fetchApiData(`/admin/customers/${customerId}/tags/${created.id}`, {
        method: 'POST',
      });
      setNewTagLabel('');
      setNewTagColor('');
      await loadAllTags();
      onUpdated();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create tag.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        Manage
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TagIcon className="size-4" /> Manage Tags
          </DialogTitle>
          <DialogDescription>
            Assign tags to categorize this customer for segmentation and reporting.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        {/* Existing Tags Toggle Grid */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Available Tags
          </Label>
          {loading ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline size-3.5 animate-spin" /> Loading tags...
            </div>
          ) : allTags.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No tags created yet. Create one below.</p>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-1">
              {allTags.map((tag) => {
                const isAssigned = assignedIds.has(tag.id);
                const isPending = busyTagId === tag.id;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    disabled={isPending}
                    onClick={() => void toggleTag(tag)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      isAssigned
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                    style={
                      tag.color && isAssigned
                        ? { backgroundColor: tag.color, color: '#fff' }
                        : undefined
                    }
                  >
                    {isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : isAssigned ? (
                      <Check className="size-3" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    {tag.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Create New Tag Inline Form */}
        <form onSubmit={handleCreateTag} className="border-t pt-4 space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Create & Assign New Tag
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="Tag label (e.g. VIP, Wholesaler)"
              value={newTagLabel}
              onChange={(e) => setNewTagLabel(e.target.value)}
              className="flex-1 text-xs"
              required
            />
            <Input
              type="color"
              value={newTagColor || '#4f46e5'}
              onChange={(e) => setNewTagColor(e.target.value)}
              title="Tag color"
              className="size-9 p-1 cursor-pointer shrink-0"
            />
            <Button type="submit" size="sm" disabled={creating || !newTagLabel.trim()}>
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </form>

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
