'use client';

import * as React from 'react';
import {
  Smartphone,
  Laptop,
  ShieldAlert,
  DollarSign,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ZoomIn,
  MousePointer,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MoneyField } from '@/components/ui/money-field';
import { Badge } from '@/components/ui/badge';
import { PageSection, PagePanel } from '@/components/ui/page-shell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useFormDialogLifecycle } from '@/hooks/use-form-dialog-lifecycle';

export function MobileFormsLab() {
  // Device & Pointer Diagnostics State
  const [isCoarse, setIsCoarse] = React.useState<boolean | null>(null);
  const [canHover, setCanHover] = React.useState<boolean | null>(null);
  const [viewportDims, setViewportDims] = React.useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const hoverQuery = window.matchMedia('(hover: hover)');

    setIsCoarse(coarseQuery.matches);
    setCanHover(hoverQuery.matches);
    setViewportDims({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const handleCoarseChange = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    const handleHoverChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    const handleResize = () => {
      setViewportDims({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    coarseQuery.addEventListener('change', handleCoarseChange);
    hoverQuery.addEventListener('change', handleHoverChange);
    window.addEventListener('resize', handleResize);

    return () => {
      coarseQuery.removeEventListener('change', handleCoarseChange);
      hoverQuery.removeEventListener('change', handleHoverChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Playground MoneyField State
  const [demoAmount, setDemoAmount] = React.useState('14500.50');
  const [demoAmountError, setDemoAmountError] = React.useState(false);

  // Tier 1: Quick Action Dialog State & Lifecycle
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogForm, setDialogForm] = React.useState({
    title: '',
    amount: '',
    category: 'GENERAL',
    notes: '',
  });
  const isDialogDirty =
    dialogForm.title.trim().length > 0 ||
    dialogForm.amount.trim().length > 0 ||
    dialogForm.notes.trim().length > 0;

  const dialogLifecycle = useFormDialogLifecycle({
    open: dialogOpen,
    onOpenChange: setDialogOpen,
    isDirty: isDialogDirty,
    title: 'Discard unsaved changes?',
    description:
      'You have entered uncommitted form data in this dialog. Are you sure you want to dismiss it?',
    onClose: () => {
      setDialogForm({
        title: '',
        amount: '',
        category: 'GENERAL',
        notes: '',
      });
    },
  });

  // Tier 2: Standard Form Sheet State & Lifecycle
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [sheetForm, setSheetForm] = React.useState({
    supplierName: '',
    tradeLicense: '',
    contactPerson: '',
    contractValue: '',
    paymentTerms: 'NET_30',
    notes: '',
  });
  const isSheetDirty =
    sheetForm.supplierName.trim().length > 0 ||
    sheetForm.tradeLicense.trim().length > 0 ||
    sheetForm.contactPerson.trim().length > 0 ||
    sheetForm.contractValue.trim().length > 0 ||
    sheetForm.notes.trim().length > 0;

  const sheetLifecycle = useFormDialogLifecycle({
    open: sheetOpen,
    onOpenChange: setSheetOpen,
    isDirty: isSheetDirty,
    title: 'Discard new supplier registration?',
    description:
      'You have uncommitted supplier profile changes. Discarding will close this drawer and lose entered details.',
    onClose: () => {
      setSheetForm({
        supplierName: '',
        tradeLicense: '',
        contactPerson: '',
        contractValue: '',
        paymentTerms: 'NET_30',
        notes: '',
      });
    },
  });

  return (
    <div className="space-y-8">
      {/* 1. Live Diagnostics Panel */}
      <PageSection
        title="Hardware & Viewport Diagnostics"
        description="Real-time detection of input pointer mode, dynamic viewport height, and typography scaling rules."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pointer Mode */}
          <PagePanel className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pointer Hardware</span>
              {isCoarse ? (
                <Smartphone className="size-4 text-primary" />
              ) : (
                <Laptop className="size-4 text-muted-foreground" />
              )}
            </div>
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              {isCoarse === null ? (
                'Detecting…'
              ) : isCoarse ? (
                <>
                  <span>Coarse (Touch)</span>
                  <Badge variant="default" className="text-[10px]">
                    Mobile / Tablet
                  </Badge>
                </>
              ) : (
                <>
                  <span>Fine (Cursor)</span>
                  <Badge variant="outline" className="text-[10px]">
                    Desktop Mouse
                  </Badge>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isCoarse
                ? 'Coarse touch mode active: 16px text & 44px min tap targets enforced.'
                : 'Fine pointer active: 14px compact desktop typography applied.'}
            </p>
          </PagePanel>

          {/* iOS Auto-Zoom Mitigation */}
          <PagePanel className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">iOS Auto-Zoom Guard</span>
              <ZoomIn className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>Active (16px base)</span>
              <Badge variant="success" className="text-[10px]">
                Protected
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Form inputs enforce &ge; 16px on coarse pointers to prevent iOS Safari auto-zooming, while preserving user pinch-to-zoom.
            </p>
          </PagePanel>

          {/* Viewport Bounds */}
          <PagePanel className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Dynamic Viewport</span>
              <Layers className="size-4 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="text-base font-semibold text-foreground font-mono tabular-nums">
              {viewportDims.width > 0
                ? `${viewportDims.width}px × ${viewportDims.height}px`
                : '100dvh'}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Using dvh/dvw units to prevent mobile bottom URL bar and keyboard overlap.
            </p>
          </PagePanel>

          {/* AutoFocus Suppression */}
          <PagePanel className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Modal AutoFocus</span>
              <MousePointer className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>{isCoarse ? 'Suppressed' : 'Desktop Only'}</span>
              <Badge variant={isCoarse ? 'warning' : 'outline'} className="text-[10px]">
                {isCoarse ? 'No Surprise Keyboard' : 'Standard'}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Prevents unprompted mobile keyboard opening and layout displacement when opening dialogs.
            </p>
          </PagePanel>
        </div>
      </PageSection>

      {/* 2. Interactive Input Primitives Playground */}
      <PageSection
        title="Touch-Safe Input Primitives"
        description="Standardized form controls with 44px minimum touch targets and 16px base typography on touch devices."
      >
        <PagePanel className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Standard Text Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Text Input <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  text-base md:text-sm
                </span>
              </div>
              <Input placeholder="Enter operational title…" defaultValue="Dhaka Dispatch Center" />
              <p className="text-[11px] text-muted-foreground">
                Scaled to 16px on coarse pointers to suppress iOS viewport zoom.
              </p>
            </div>

            {/* MoneyField */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  MoneyField (BDT) <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  tabular-nums font-mono
                </span>
              </div>
              <MoneyField
                value={demoAmount}
                onChange={setDemoAmount}
                error={demoAmountError ? 'Amount exceeds operational cash buffer limit.' : null}
                placeholder="0.00"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Value: ৳ {demoAmount || '0.00'}</span>
                <button
                  type="button"
                  onClick={() => setDemoAmountError(!demoAmountError)}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Toggle Error
                </button>
              </div>
            </div>

            {/* Native Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Native Select <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  min-h-11 on touch
                </span>
              </div>
              <NativeSelect defaultValue="dhk">
                <NativeSelectOption value="dhk">Dhaka Main Warehouse</NativeSelectOption>
                <NativeSelectOption value="ctg">Chittagong Distribution Hub</NativeSelectOption>
                <NativeSelectOption value="syl">Sylhet Operations Depot</NativeSelectOption>
              </NativeSelect>
              <p className="text-[11px] text-muted-foreground">
                Native picker invokes mobile OS wheel without custom popover overflow.
              </p>
            </div>

            {/* Base UI Custom Select */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">
                  Custom Select (Base UI) <span className="text-destructive">*</span>
                </label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  44px item touch targets
                </span>
              </div>
              <Select defaultValue="AIR">
                <SelectTrigger>
                  <SelectValue placeholder="Select shipping mode…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AIR">Air Freight Priority (DHK-AIR)</SelectItem>
                  <SelectItem value="ROAD">Inter-District Road Trucking</SelectItem>
                  <SelectItem value="EXPRESS">Same-Day Express Courier</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Accessible floating dropdown with 44px min-h touch target items on mobile.
              </p>
            </div>
          </div>

          {/* Textarea */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">Operational Textarea</label>
              <span className="text-[10px] font-mono text-muted-foreground">
                pointer-coarse:text-base
              </span>
            </div>
            <Textarea
              placeholder="Provide delivery routing, special packaging, or inspection instructions…"
              rows={3}
              defaultValue="Standard courier dispatch. Require OTP confirmation from receiver upon handover."
            />
          </div>
        </PagePanel>
      </PageSection>

      {/* 3. Three-Tier Architectural Demonstrators */}
      <PageSection
        title="Three-Tier Dialog & Sheet Architectures"
        description="Interactive verification of lifecycle discard protection, bounded flex scrolling, and safe-area footers."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Tier 1 Demonstrator Card */}
          <PagePanel className="p-5 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                  Tier 1: Quick Action Dialog
                </span>
                <Badge variant="outline" className="text-[11px]">
                  max-h-[calc(100dvh-2rem)]
                </Badge>
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Centered Modal with Discard Guard
              </h3>
              <p className="text-xs text-muted-foreground">
                Designed for quick, focused operations (1–4 fields). Intercepts outside clicks and Escape key when form data is dirty.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <ShieldAlert className="size-4 text-primary" />
                <span>Lifecycle Protection Invariant:</span>
              </div>
              <p className="text-muted-foreground">
                Open the dialog, type any character into the fields, and attempt to click the backdrop or Escape. Base UI event is cleanly intercepted.
              </p>
            </div>

            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => setDialogOpen(true)}
            >
              Open Tier 1 Quick Dialog
            </Button>
          </PagePanel>

          {/* Tier 2 Demonstrator Card */}
          <PagePanel className="p-5 space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-info">
                  Tier 2: Standard Form Sheet
                </span>
                <Badge variant="outline" className="text-[11px]">
                  max-h-[92dvh] / Bounded Flex
                </Badge>
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Bounded Flex Sheet with Sticky Chrome
              </h3>
              <p className="text-xs text-muted-foreground">
                Designed for multi-section operational workflows (5–12 fields). Sticky header, scrollable body, and safe-area pinned footer.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <Layers className="size-4 text-info" />
                <span>Bounded Scrolling Invariant:</span>
              </div>
              <p className="text-muted-foreground">
                The action buttons remain permanently visible above the iOS home indicator bar via safe-area padding.
              </p>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => setSheetOpen(true)}
            >
              Open Tier 2 Form Sheet
            </Button>
          </PagePanel>
        </div>
      </PageSection>

      {/* 4. Z-Index Layer Stacking Reference */}
      <PageSection
        title="Authoritative 4-Tier Z-Index Architecture"
        description="Strict stacking hierarchy preventing overlay collisions, clipping, and hidden discard prompts."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Level 1: Base Shell
            </div>
            <div className="text-base font-mono font-bold text-foreground">z-10 – z-30</div>
            <p className="text-xs text-muted-foreground">
              Sticky table headers, topbars, navigation breadcrumbs, and floating action bars.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              Level 2: Drawers & Sheets
            </div>
            <div className="text-base font-mono font-bold text-foreground">z-40</div>
            <p className="text-xs text-muted-foreground">
              Standard side sheets, slide-over inspection drawers, and mobile navigation sheets.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-2xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              Level 3: Modal Dialogs
            </div>
            <div className="text-base font-mono font-bold text-foreground">z-50</div>
            <p className="text-xs text-muted-foreground">
              Centered action modals, detail viewers, and entity creation popups.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Level 4: Discard & Alerts
            </div>
            <div className="text-base font-mono font-bold text-foreground">z-60 – z-70</div>
            <p className="text-xs text-muted-foreground">
              Unsaved changes alert dialogs, system confirmations, dropdown menus, and tooltips. Always on top!
            </p>
          </div>
        </div>
      </PageSection>

      {/* TIER 1 DIALOG INSTANCE */}
      <Dialog open={dialogOpen} onOpenChange={dialogLifecycle.handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Record Petty Cash Voucher</DialogTitle>
              {isDialogDirty ? (
                <Badge variant="warning" className="text-[10px]">
                  Unsaved Changes
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Pristine
                </Badge>
              )}
            </div>
            <DialogDescription>
              Record an on-site operational expenditure with ledger categorization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Voucher Purpose / Memo <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Courier emergency packaging"
                value={dialogForm.title}
                onChange={(e) => setDialogForm({ ...dialogForm, title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Amount (BDT) <span className="text-destructive">*</span>
              </label>
              <MoneyField
                value={dialogForm.amount}
                onChange={(val) => setDialogForm({ ...dialogForm, amount: val })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Expense Category
              </label>
              <NativeSelect
                value={dialogForm.category}
                onChange={(e) => setDialogForm({ ...dialogForm, category: e.target.value })}
              >
                <NativeSelectOption value="GENERAL">General Operational</NativeSelectOption>
                <NativeSelectOption value="PACKAGING">Packaging & Supplies</NativeSelectOption>
                <NativeSelectOption value="LOGISTICS">Logistics & Transit</NativeSelectOption>
                <NativeSelectOption value="UTILITIES">Showroom Utilities</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Auditor Notes
              </label>
              <Textarea
                rows={2}
                placeholder="Attach receipt reference or cashier notes…"
                value={dialogForm.notes}
                onChange={(e) => setDialogForm({ ...dialogForm, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => dialogLifecycle.handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => {
                setDialogOpen(false);
                setDialogForm({
                  title: '',
                  amount: '',
                  category: 'GENERAL',
                  notes: '',
                });
              }}
            >
              Confirm Voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {dialogLifecycle.discardConfirmDialog}

      {/* TIER 2 SHEET INSTANCE */}
      <Sheet open={sheetOpen} onOpenChange={sheetLifecycle.handleOpenChange}>
        <SheetContent side="right" className="flex flex-col sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>Register Wholesale Supplier</SheetTitle>
              {isSheetDirty ? (
                <Badge variant="warning" className="text-[10px]">
                  Unsaved Changes
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Pristine
                </Badge>
              )}
            </div>
            <SheetDescription>
              Onboard a domestic manufacturing or fabric milling supplier to Maevelle catalog supply.
            </SheetDescription>
          </SheetHeader>

          {/* Scrollable Form Body with Bounded Flex */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-4 pr-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Supplier Trade Name <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g. Bengal Heritage Weavers Ltd."
                value={sheetForm.supplierName}
                onChange={(e) => setSheetForm({ ...sheetForm, supplierName: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Trade License / BIN
              </label>
              <Input
                placeholder="BIN-9041-8842-DHK"
                value={sheetForm.tradeLicense}
                onChange={(e) => setSheetForm({ ...sheetForm, tradeLicense: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Primary Contact Person
              </label>
              <Input
                placeholder="Name, Phone or WhatsApp…"
                value={sheetForm.contactPerson}
                onChange={(e) => setSheetForm({ ...sheetForm, contactPerson: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Initial Contract Allocation (BDT)
              </label>
              <MoneyField
                value={sheetForm.contractValue}
                onChange={(val) => setSheetForm({ ...sheetForm, contractValue: val })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">Payment Terms</label>
              <NativeSelect
                value={sheetForm.paymentTerms}
                onChange={(e) => setSheetForm({ ...sheetForm, paymentTerms: e.target.value })}
              >
                <NativeSelectOption value="ADVANCE">100% Advance Payment</NativeSelectOption>
                <NativeSelectOption value="NET_15">Net 15 Days</NativeSelectOption>
                <NativeSelectOption value="NET_30">Net 30 Days (Standard)</NativeSelectOption>
                <NativeSelectOption value="CONSIGNMENT">Consignment Basis</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Contractual Notes & Production Capacity
              </label>
              <Textarea
                rows={4}
                placeholder="Monthly weaving capacity, quality benchmarks, delivery warehouse preference…"
                value={sheetForm.notes}
                onChange={(e) => setSheetForm({ ...sheetForm, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Sticky Safe-Area Footer */}
          <SheetFooter className="shrink-0 border-t border-border pt-4 flex-col-reverse sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => sheetLifecycle.handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              className="w-full sm:w-auto"
              onClick={() => {
                setSheetOpen(false);
                setSheetForm({
                  supplierName: '',
                  tradeLicense: '',
                  contactPerson: '',
                  contractValue: '',
                  paymentTerms: 'NET_30',
                  notes: '',
                });
              }}
            >
              Save Supplier
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {sheetLifecycle.discardConfirmDialog}
    </div>
  );
}
