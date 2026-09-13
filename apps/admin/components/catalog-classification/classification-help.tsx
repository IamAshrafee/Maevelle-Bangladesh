'use client';

import { Boxes, CalendarHeart, FolderTree, Sparkles, Tags } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
          <Card className="p-4 gap-1.5">
            <CardHeader className="p-0 gap-1.5">
              <CardTitle className="text-sm flex items-center gap-2">
                <FolderTree className="size-4 text-primary" />
                Category
              </CardTitle>
              <CardDescription className="text-xs">
                Where customers browse. Example: Women / Clothing / Dresses.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="p-4 gap-1.5">
            <CardHeader className="p-0 gap-1.5">
              <CardTitle className="text-sm flex items-center gap-2">
                <Tags className="size-4 text-primary" />
                Tag
              </CardTitle>
              <CardDescription className="text-xs">
                A flexible label. Example: bestseller or limited-stock.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="p-4 gap-1.5">
            <CardHeader className="p-0 gap-1.5">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarHeart className="size-4 text-primary" />
                Occasion or event
              </CardTitle>
              <CardDescription className="text-xs">
                When the item is suitable. Example: Wedding, Eid, or Office.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="p-4 gap-1.5">
            <CardHeader className="p-0 gap-1.5">
              <CardTitle className="text-sm flex items-center gap-2">
                <Boxes className="size-4 text-primary" />
                Collection
              </CardTitle>
              <CardDescription className="text-xs">
                A curated campaign group. Example: Eid 2026 or Summer Edit.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        <Alert>
          <Sparkles className="size-4 text-amber-500" />
          <AlertDescription className="text-xs leading-relaxed">
            Real scenario: a silk dress can belong to <strong>Dresses</strong>, use the tag{' '}
            <strong>hand-finished</strong>, suit the <strong>Wedding</strong> occasion, and appear in
            the <strong>Festive Edit</strong> collection.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button onClick={() => props.onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
