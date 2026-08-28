'use client';

import { BookOpen, Boxes, CircleDollarSign, FileCheck2, Layers3, ReceiptText } from 'lucide-react';
import type { ComponentType } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type {
  Assignment,
  Cogs,
  Layer,
  Shipment,
  Valuation,
  Worksheet,
} from '@/lib/supply/costing-types';

function SummaryCards({
  cards,
}: {
  cards: readonly [string, string | number, string, ComponentType<{ className?: string }>][];
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Cost snapshot">
      {cards.map(([label, value, detail, Icon]) => (
        <Card key={label} size="sm">
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <strong className="mt-1 block text-2xl tracking-tight">{value}</strong>
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="size-4" />
            </span>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function LandedCostSummary({
  shipments,
  worksheets,
}: {
  shipments: readonly Shipment[];
  worksheets: readonly Worksheet[];
}) {
  const drafts = worksheets.filter((item) => item.status === 'DRAFT').length;
  const finalized = worksheets.filter((item) => item.status === 'FINALIZED').length;
  const openRevisions = worksheets.reduce(
    (total, worksheet) =>
      total + worksheet.revisions.filter((revision) => revision.status === 'DRAFT').length,
    0,
  );
  return (
    <SummaryCards
      cards={[
        ['Inbound shipments', shipments.length, 'Available for cost work', Boxes],
        ['Draft worksheets', drafts, 'Still editable', ReceiptText],
        ['Open revisions', openRevisions, 'Need preview or finalization', Layers3],
        ['Finalized worksheets', finalized, 'Immutable costing evidence', FileCheck2],
      ]}
    />
  );
}

export function CostingSummary({
  layers,
  assignments,
  cogs,
  valuation,
}: {
  layers: readonly Layer[];
  assignments: readonly Assignment[];
  cogs: readonly Cogs[];
  valuation: readonly Valuation[];
}) {
  const remainingUnits = layers.reduce(
    (total, layer) => total + Number(layer.remaining_quantity),
    0,
  );
  return (
    <SummaryCards
      cards={[
        ['Cost layers', layers.length, 'Receipt-backed FIFO facts', Layers3],
        [
          'Units with cost',
          new Intl.NumberFormat('en-BD').format(remainingUnits),
          'Remaining in FIFO layers',
          Boxes,
        ],
        ['Outbound assignments', assignments.length, 'Cost attached at dispatch', ReceiptText],
        ['COGS records', cogs.length, `${valuation.length} valuation positions`, CircleDollarSign],
      ]}
    />
  );
}

function HelpDialog({
  open,
  onOpenChange,
  title,
  steps,
  example,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  steps: readonly string[];
  example: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Simple steps and a real example.</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {steps.map((step, index) => (
            <li className="flex gap-3" key={step}>
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <div className="rounded-lg bg-muted p-4">
          <strong className="text-sm">Real example</strong>
          <p className="mt-1 text-sm text-muted-foreground">{example}</p>
        </div>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

export function LandedCostHelpDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <HelpDialog
      {...props}
      title="How landed cost works"
      steps={[
        'Choose the inbound shipment whose true acquisition cost you want to calculate.',
        'Add freight, duty, insurance, handling, or supplier credits with their source currency.',
        'Preview the allocation, check every item, then finalize the revision as permanent evidence.',
      ]}
      example="A shipment costs CNY 20,000, plus CNY 2,000 freight and CNY 600 duty. Allocate those extra costs across its items before the stock is valued."
    />
  );
}

export function CostingHelpDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <HelpDialog
      {...props}
      title="How inventory costing works"
      steps={[
        'Receiving creates cost layers tied to real receipt quantities.',
        'Dispatch consumes the oldest eligible FIFO layers and records an outbound assignment.',
        'Successful delivery recognizes COGS; valuation shows the cost still held in inventory.',
      ]}
      example="Ten units arrive at BDT 800 each. Dispatching three uses BDT 2,400 of FIFO cost; delivery recognizes that amount as COGS while seven units remain valued in stock."
    />
  );
}

export function CostingHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} title="Open a simple guide" type="button">
      <BookOpen /> How it works
    </Button>
  );
}
