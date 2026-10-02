'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface SettingsConfirmationDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: ReactNode;
  readonly consequences?: readonly string[];
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'destructive' | 'default';
  readonly loading?: boolean;
  readonly onConfirm: () => void | Promise<void>;
}

export function SettingsConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences,
  confirmLabel = 'Confirm change',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  onConfirm,
}: SettingsConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {variant === 'destructive' && (
              <div className="flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0">
                <AlertTriangle className="size-5" />
              </div>
            )}
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">{title}</DialogTitle>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-2 leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        {consequences && consequences.length > 0 && (
          <div className="space-y-1.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs">
            <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
              Expected operational impact:
            </span>
            <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
              {consequences.map((consequence, idx) => (
                <li key={idx}>{consequence}</li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="text-xs h-9"
          >
            {cancelLabel}
          </Button>

          <Button
            type="button"
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            size="sm"
            onClick={onConfirm}
            disabled={loading}
            className="text-xs h-9 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                Processing...
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
