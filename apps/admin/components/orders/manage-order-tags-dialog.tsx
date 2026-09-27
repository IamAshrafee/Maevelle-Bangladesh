'use client';

import { Check, CircleAlert, Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { OrderDetailDto, OrderTagDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';

const PRESET_COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

export function ManageOrderTagsDialog({
  order,
  onCompleted,
}: {
  readonly order: OrderDetailDto;
  readonly onCompleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<readonly OrderTagDto[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // New tag state
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [creatingTag, setCreatingTag] = useState(false);

  async function loadTags() {
    setLoadingTags(true);
    try {
      const tags = await fetchApiData<OrderTagDto[]>('/admin/orders/tags');
      setAvailableTags(tags);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoadingTags(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      void loadTags();
      setMessage('');
    }
    setOpen(nextOpen);
  }

  const assignedTags = order.tags ?? [];
  const assignedTagIds = new Set(assignedTags.map((t) => t.id));

  async function toggleTag(tag: OrderTagDto) {
    if (busyTagId) return;
    setBusyTagId(tag.id);
    setMessage('');
    try {
      if (assignedTagIds.has(tag.id)) {
        await fetchApiData(`/admin/orders/${order.id}/tags/${tag.id}`, {
          method: 'DELETE',
        });
      } else {
        await fetchApiData(`/admin/orders/${order.id}/tags/${tag.id}`, {
          method: 'POST',
        });
      }
      onCompleted();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update tag assignment');
    } finally {
      setBusyTagId(null);
    }
  }

  async function handleCreateTag(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newTagName.trim() || creatingTag) return;
    setCreatingTag(true);
    setMessage('');
    try {
      const created = await fetchApiData<OrderTagDto>('/admin/orders/tags', {
        method: 'POST',
        body: JSON.stringify({
          label: newTagName.trim(),
          color: newTagColor,
        }),
      });
      setNewTagName('');
      // Assign the newly created tag immediately to this order
      await fetchApiData(`/admin/orders/${order.id}/tags/${created.id}`, {
        method: 'POST',
      });
      await loadTags();
      onCompleted();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="h-8 gap-1.5" />}>
        <Tag className="size-3.5" aria-hidden="true" /> Manage tags
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Order Tags</DialogTitle>
          <DialogDescription>
            Categorize order {order.orderNumber} for operations (e.g. VIP, Priority, Review, Social).
          </DialogDescription>
        </DialogHeader>

        {message ? (
          <div
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>{message}</p>
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Assigned Tags
            </Label>
            <div className="mt-2 flex min-h-9 flex-wrap gap-1.5 rounded-lg border bg-muted/20 p-2">
              {assignedTags.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">No tags assigned.</span>
              ) : (
                assignedTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant="outline"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium"
                    style={{
                      borderColor: t.color ? `${t.color}80` : undefined,
                      backgroundColor: t.color ? `${t.color}15` : undefined,
                      color: t.color || undefined,
                    }}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: t.color ?? '#6b7280' }}
                    />
                    {t.label ?? t.name}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available Organization Tags
            </Label>
            <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-lg border p-2">
              {loadingTags ? (
                <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 size-4 animate-spin" /> Loading tags…
                </div>
              ) : availableTags.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  No tags in registry. Create one below!
                </p>
              ) : (
                availableTags.map((tag) => {
                  const isAssigned = assignedTagIds.has(tag.id);
                  const isBusy = busyTagId === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      disabled={Boolean(busyTagId)}
                      onClick={() => void toggleTag(tag)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        isAssigned
                          ? 'bg-primary/10 font-medium text-foreground'
                          : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color ?? '#6b7280' }}
                        />
                        <span>{tag.label ?? tag.name}</span>
                      </div>
                      <div className="flex items-center">
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                        ) : isAssigned ? (
                          <Check className="size-4 text-primary" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Click to assign</span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <form onSubmit={handleCreateTag} className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Create New Tag
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Urgent, Wholesale, Facebook VIP"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" className="h-8 shrink-0 text-xs" disabled={creatingTag || !newTagName.trim()}>
                {creatingTag ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Plus className="mr-1 size-3" />}
                Add Tag
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Color:</span>
              <div className="flex gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewTagColor(c)}
                    className={`size-5 rounded-full border transition-transform ${
                      newTagColor === c ? 'scale-125 ring-2 ring-ring ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
