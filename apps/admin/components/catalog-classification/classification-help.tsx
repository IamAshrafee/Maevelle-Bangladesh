'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ClassificationHelp(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How product organization works</DialogTitle>
          <DialogDescription>
            Use the most structured choice that matches what you mean. This keeps filters and
            reports clear.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <strong>Category</strong>
            <p className="mt-1 text-muted-foreground">
              Where customers browse. Example: Women / Clothing / Dresses.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <strong>Tag</strong>
            <p className="mt-1 text-muted-foreground">
              A flexible label. Example: bestseller or limited-stock.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <strong>Occasion or event</strong>
            <p className="mt-1 text-muted-foreground">
              When the item is suitable. Example: Wedding, Eid, or Office.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <strong>Collection</strong>
            <p className="mt-1 text-muted-foreground">
              A curated campaign group. Example: Eid 2026 or Summer Edit.
            </p>
          </div>
        </div>
        <p className="rounded-lg bg-muted p-4 text-sm">
          Real scenario: a silk dress can belong to <strong>Dresses</strong>, use the tag{' '}
          <strong>hand-finished</strong>, suit the <strong>Wedding</strong> occasion, and appear in
          the <strong>Festive Edit</strong> collection.
        </p>
        <DialogFooter>
          <Button onClick={() => props.onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
