'use client';

import * as React from 'react';
import { Edit3, AlertCircle, Save, Loader2, Calendar, Layers, DollarSign } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { apiRequest, ApiRequestError } from '@/lib/api';
import type { Combinability, PromotionItem } from './types';

interface EditPromotionDialogProps {
  readonly promotion: PromotionItem | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

function toLocalInputDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    // Format to YYYY-MM-DDThh:mm for datetime-local input
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

export function EditPromotionDialog({
  promotion,
  open,
  onOpenChange,
  onSuccess,
}: EditPromotionDialogProps) {
  const [name, setName] = React.useState('');
  const [combinability, setCombinability] = React.useState<Combinability>('EXCLUSIVE');
  const [priority, setPriority] = React.useState('0');
  const [minimumSubtotal, setMinimumSubtotal] = React.useState('');
  const [startsAt, setStartsAt] = React.useState('');
  const [endsAt, setEndsAt] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (promotion && open) {
      setName(promotion.name);
      setCombinability(promotion.combinability);
      setPriority(promotion.priority.toString());
      setMinimumSubtotal(promotion.minimumMerchandiseSubtotal ?? '');
      setStartsAt(toLocalInputDate(promotion.startsAt));
      setEndsAt(toLocalInputDate(promotion.endsAt));
      setError(null);
    }
  }, [promotion, open]);

  if (!promotion) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!promotion) return;
    if (!name.trim()) {
      setError('Promotion campaign name is required.');
      return;
    }

    setBusy(true);
    setError(null);

    const promoId = promotion.id;
    try {
      await apiRequest(`/admin/promotions/${promoId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          combinability,
          priority: parseInt(priority, 10) || 0,
          minimumMerchandiseSubtotal: minimumSubtotal.trim() ? minimumSubtotal.trim() : null,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        }),
      });

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update promotion.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Edit3 className="size-4" />
            </div>
            <div>
              <DialogTitle>Edit Promotion Campaign</DialogTitle>
              <DialogDescription>
                Update campaign settings and schedule for <strong className="text-foreground">{promotion.name}</strong>.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="edit-name" className="text-xs font-semibold text-foreground">
              Campaign Name <span className="text-destructive">*</span>
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Eid Mega Sale 15%"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-combinability" className="text-xs font-medium text-foreground">
                  Combinability
                </label>
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                          Rules
                        </span>
                      }
                    />
                    <TooltipContent className="max-w-xs">
                      Exclusive prevents stacking with any other promo. Stackable allows combining with other stackable offers.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <NativeSelect
                id="edit-combinability"
                value={combinability}
                onChange={(e) => setCombinability(e.target.value as Combinability)}
              >
                <option value="EXCLUSIVE">Exclusive (Single promotion)</option>
                <option value="STACKABLE">Stackable (Combines with others)</option>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="edit-priority" className="text-xs font-medium text-foreground">
                  Evaluation Priority
                </label>
                <TooltipProvider delay={150}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span className="text-[0.7rem] text-muted-foreground cursor-help underline decoration-dotted">
                          Ordering
                        </span>
                      }
                    />
                    <TooltipContent>
                      Higher priority promotions are evaluated first. Useful when choosing between conflicting discounts.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Input
                id="edit-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="edit-min-subtotal" className="text-xs font-medium text-foreground">
                Minimum Merchandise Subtotal (BDT)
              </label>
              <span className="text-[0.7rem] text-muted-foreground">Optional threshold</span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-muted-foreground select-none">
                ৳
              </span>
              <Input
                id="edit-min-subtotal"
                value={minimumSubtotal}
                onChange={(e) => setMinimumSubtotal(e.target.value)}
                placeholder="e.g. 1500 (Leave blank for no minimum)"
                className="pl-7 font-mono tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label htmlFor="edit-starts" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground" />
                Starts At
              </label>
              <Input
                id="edit-starts"
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="text-xs"
              />
              <p className="text-[0.68rem] text-muted-foreground">Leave blank for immediate start</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-ends" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Calendar className="size-3.5 text-muted-foreground" />
                Ends At
              </label>
              <Input
                id="edit-ends"
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="text-xs"
              />
              <p className="text-[0.68rem] text-muted-foreground">Leave blank for ongoing duration</p>
            </div>
          </div>

          <DialogFooter className="pt-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()} className="gap-1.5">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
