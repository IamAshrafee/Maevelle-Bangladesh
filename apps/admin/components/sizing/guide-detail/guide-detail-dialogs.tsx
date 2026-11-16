'use client';

import type { FormEvent } from 'react';
import Link from 'next/link';
import { Check, Download, Loader2, Send, Trash2, Upload } from 'lucide-react';

import type {
  MeasurementDefinitionDto,
  PublicSizeGuideDto,
  SizeDefinitionDto,
  SizeGuideDetailDto,
  SizeGuidePublishPreviewDto,
  SizeSystemDto,
  SizingMeasurementUnitDto,
} from '@maevelle/contracts';

import { CustomerGuidePreview } from '@/components/sizing/customer-guide-preview';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import type { CellEditState, GuideEditState, RowEditState } from './guide-detail-utils';

interface GuideDetailDialogsProps {
  guide: SizeGuideDetailDto;
  activeRevisionNumber: number | undefined;
  measurements: readonly MeasurementDefinitionDto[];
  sizeDefinitions: readonly SizeDefinitionDto[];
  systems: readonly SizeSystemDto[];
  busy: boolean;
  // Customer preview
  showCustomerPreview: boolean;
  setShowCustomerPreview: (open: boolean) => void;
  customerPreview: PublicSizeGuideDto | null;
  // Publish review
  publishPreview: SizeGuidePublishPreviewDto | null;
  setPublishPreview: (preview: SizeGuidePublishPreviewDto | null) => void;
  onPublishRevision: () => void;
  // Cell editor
  editingCell: CellEditState;
  setEditingCell: (updater: CellEditState | ((cur: CellEditState) => CellEditState)) => void;
  cellSaving: boolean;
  cellError: string;
  onSaveCell: (e: FormEvent<HTMLFormElement>) => void;
  onClearCell: () => void;
  // Row editor
  editingRow: RowEditState;
  setEditingRow: (row: RowEditState) => void;
  rowSaving: boolean;
  onSaveRowEdit: (e: FormEvent<HTMLFormElement>) => void;
  // Guide editor
  editingGuide: GuideEditState;
  setEditingGuide: (guide: GuideEditState) => void;
  guideSaving: boolean;
  onSaveGuideMetadata: (e: FormEvent<HTMLFormElement>) => void;
  // Duplicate guide
  showDuplicateModal: boolean;
  setShowDuplicateModal: (open: boolean) => void;
  duplicateName: string;
  setDuplicateName: (name: string) => void;
  duplicateBusy: boolean;
  onDuplicateGuide: (e: FormEvent<HTMLFormElement>) => void;
  // CSV Import
  showImportModal: boolean;
  setShowImportModal: (open: boolean) => void;
  importCsvText: string;
  setImportCsvText: (text: string) => void;
  importBusy: boolean;
  importError: string;
  onImportCsv: (e: FormEvent<HTMLFormElement>) => void;
  onExportCsv: () => void;
  // Linked products drawer
  showLinkedDrawer: boolean;
  setShowLinkedDrawer: (open: boolean) => void;
}

export function GuideDetailDialogs({
  guide,
  activeRevisionNumber,
  measurements,
  sizeDefinitions,
  systems,
  busy,
  showCustomerPreview,
  setShowCustomerPreview,
  customerPreview,
  publishPreview,
  setPublishPreview,
  onPublishRevision,
  editingCell,
  setEditingCell,
  cellSaving,
  cellError,
  onSaveCell,
  onClearCell,
  editingRow,
  setEditingRow,
  rowSaving,
  onSaveRowEdit,
  editingGuide,
  setEditingGuide,
  guideSaving,
  onSaveGuideMetadata,
  showDuplicateModal,
  setShowDuplicateModal,
  duplicateName,
  setDuplicateName,
  duplicateBusy,
  onDuplicateGuide,
  showImportModal,
  setShowImportModal,
  importCsvText,
  setImportCsvText,
  importBusy,
  importError,
  onImportCsv,
  onExportCsv,
  showLinkedDrawer,
  setShowLinkedDrawer,
}: GuideDetailDialogsProps) {
  return (
    <>
      {/* DIALOG: CUSTOMER PREVIEW */}
      <Dialog open={showCustomerPreview} onOpenChange={setShowCustomerPreview}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Customer preview</DialogTitle>
            <DialogDescription>
              This uses the same guide data contract as the Storefront. Product-specific size
              selection is intentionally disabled here.
            </DialogDescription>
          </DialogHeader>
          {customerPreview ? <CustomerGuidePreview guide={customerPreview} /> : null}
        </DialogContent>
      </Dialog>

      {/* SHEET: CELL MEASUREMENT EDITOR */}
      <Sheet open={Boolean(editingCell)} onOpenChange={(open) => !open && setEditingCell(null)}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{editingCell?.measurementName}</SheetTitle>
            <SheetDescription className="text-xs">
              Size &quot;{editingCell?.rowLabel}&quot; · Revision {activeRevisionNumber}
            </SheetDescription>
          </SheetHeader>

          {editingCell ? (
            <form onSubmit={onSaveCell} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                {cellError ? (
                  <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                    {cellError}
                  </div>
                ) : null}

                <label className="block text-xs font-medium text-foreground">
                  Exact Numeric Value
                  <Input
                    value={editingCell.exact}
                    onChange={(e) =>
                      setEditingCell((cur) => (cur ? { ...cur, exact: e.target.value } : null))
                    }
                    placeholder="e.g. 40 or 40.5"
                    className="mt-1 h-9 font-mono text-xs tabular-nums"
                  />
                </label>

                <div className="flex items-center gap-2 text-[10px] uppercase font-mono text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span>or Range (Min–Max)</span>
                  <span className="h-px flex-1 bg-border" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-foreground">
                    Min Value
                    <Input
                      value={editingCell.min}
                      onChange={(e) =>
                        setEditingCell((cur) => (cur ? { ...cur, min: e.target.value } : null))
                      }
                      placeholder="e.g. 38"
                      className="mt-1 h-9 font-mono text-xs tabular-nums"
                    />
                  </label>
                  <label className="block text-xs font-medium text-foreground">
                    Max Value
                    <Input
                      value={editingCell.max}
                      onChange={(e) =>
                        setEditingCell((cur) => (cur ? { ...cur, max: e.target.value } : null))
                      }
                      placeholder="e.g. 40"
                      className="mt-1 h-9 font-mono text-xs tabular-nums"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 items-center">
                  <label className="block text-xs font-medium text-foreground">
                    Unit
                    <NativeSelect
                      value={editingCell.unit}
                      onChange={(e) =>
                        setEditingCell((cur) =>
                          cur ? { ...cur, unit: e.target.value as SizingMeasurementUnitDto } : null,
                        )
                      }
                      className="mt-1 h-9 text-xs bg-card"
                    >
                      <option value="inch">inch</option>
                      <option value="cm">cm</option>
                      <option value="kg">kg</option>
                    </NativeSelect>
                  </label>

                  <label className="flex items-center gap-2 pt-5 text-xs text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={editingCell.isApproximate}
                      onChange={(e) =>
                        setEditingCell((cur) =>
                          cur ? { ...cur, isApproximate: e.target.checked } : null,
                        )
                      }
                      className="rounded border-border text-primary focus:ring-primary size-4"
                    />
                    <span>Approximate (~)</span>
                  </label>
                </div>
              </div>

              <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                {editingCell.hasExistingValue ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cellSaving}
                    onClick={onClearCell}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2"
                  >
                    <Trash2 className="size-3.5" />
                    <span>Clear</span>
                  </Button>
                ) : (
                  <span />
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingCell(null)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={cellSaving}>
                    {cellSaving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    <span>Save Cell</span>
                  </Button>
                </div>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* DIALOG: PUBLISH REVIEW */}
      <Dialog
        open={Boolean(publishPreview)}
        onOpenChange={(open) => !open && setPublishPreview(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review customer impact</DialogTitle>
            <DialogDescription>
              Customers keep seeing the current published guide until you complete this action. This
              review becomes stale if the guide or its assignments change.
            </DialogDescription>
          </DialogHeader>
          {publishPreview ? (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">Publication</p>
                <p className="mt-1 font-semibold text-foreground">
                  {publishPreview.publishedRevisionNumber === null
                    ? 'First customer-visible version'
                    : `Published version ${publishPreview.publishedRevisionNumber}`}
                  <span className="mx-2 text-muted-foreground">→</span>
                  Working version {publishPreview.workingRevision.revisionNumber}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Products', publishPreview.affectedProducts],
                  ['Categories', publishPreview.affectedCategories],
                  ['Added rows', publishPreview.changes.addedRows],
                  ['Removed rows', publishPreview.changes.removedRows],
                  ['Changed rows', publishPreview.changes.changedRows],
                  ['Size conflicts', publishPreview.reconciliationConflicts],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-border p-3">
                    <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {publishPreview.changes.guidanceChanged ? (
                <p className="rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info">
                  Customer fit notes or measuring instructions will also change.
                </p>
              ) : null}
              {publishPreview.reconciliationConflicts > 0 ? (
                <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                  {publishPreview.reconciliationConflicts} purchasable Product size
                  {publishPreview.reconciliationConflicts === 1 ? '' : 's'} will not have a matching
                  guide row. Publishing is allowed, and those Products will appear in Needs
                  Attention.
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setPublishPreview(null)}>
                  Keep working
                </Button>
                <Button disabled={busy} onClick={onPublishRevision}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Publish to customers
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* SHEET: EDIT ROW DISPLAY LABEL & DEFINITION */}
      <Sheet open={Boolean(editingRow)} onOpenChange={(open) => !open && setEditingRow(null)}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>Edit Size Row</SheetTitle>
            <SheetDescription className="text-xs">
              Update display label or canonical size link for this chart row.
            </SheetDescription>
          </SheetHeader>
          {editingRow ? (
            <form onSubmit={onSaveRowEdit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <label className="block text-xs font-medium text-foreground">
                  Display Label
                  <Input
                    value={editingRow.displayLabel}
                    onChange={(e) => setEditingRow({ ...editingRow, displayLabel: e.target.value })}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>

                {guide.sizeSystemId ? (
                  <label className="block text-xs font-medium text-foreground">
                    Canonical Definition Link
                    <NativeSelect
                      value={editingRow.sizeDefinitionId}
                      onChange={(e) =>
                        setEditingRow({ ...editingRow, sizeDefinitionId: e.target.value })
                      }
                      className="mt-1 h-9 text-xs bg-card"
                    >
                      <option value="">Unmapped (Custom)</option>
                      {sizeDefinitions.map((def) => (
                        <option key={def.id} value={def.id}>
                          {def.label} ({def.code})
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ) : null}
              </div>

              <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingRow(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={rowSaving || !editingRow.displayLabel.trim()}
                >
                  {rowSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <span>Update Row</span>
                  )}
                </Button>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* SHEET: EDIT GUIDE INFO */}
      <Sheet open={Boolean(editingGuide)} onOpenChange={(open) => !open && setEditingGuide(null)}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>Edit Size Guide</SheetTitle>
            <SheetDescription className="text-xs">
              Update metadata and canonical size system binding for this chart.
            </SheetDescription>
          </SheetHeader>
          {editingGuide ? (
            <form onSubmit={onSaveGuideMetadata} className="flex min-h-0 flex-1 flex-col">
              <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
                <label className="block text-xs font-medium text-foreground">
                  Guide Title
                  <Input
                    value={editingGuide.name}
                    onChange={(e) => setEditingGuide({ ...editingGuide, name: e.target.value })}
                    required
                    className="mt-1 h-9 text-xs"
                  />
                </label>

                <label className="block text-xs font-medium text-foreground">
                  Description
                  <Textarea
                    rows={2}
                    value={editingGuide.description}
                    onChange={(e) =>
                      setEditingGuide({ ...editingGuide, description: e.target.value })
                    }
                    className="mt-1 text-xs bg-card"
                  />
                </label>

                <label className="block text-xs font-medium text-foreground">
                  Canonical Size System
                  <NativeSelect
                    value={editingGuide.sizeSystemId}
                    onChange={(e) =>
                      setEditingGuide({ ...editingGuide, sizeSystemId: e.target.value })
                    }
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    <option value="">No system binding (Unbound chart)</option>
                    {systems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.regionCode ? `· ${s.regionCode}` : ''}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              </div>

              <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingGuide(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={guideSaving || !editingGuide.name.trim()}>
                  {guideSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <span>Save Guide</span>
                  )}
                </Button>
              </SheetFooter>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* SHEET: DUPLICATE GUIDE */}
      <Sheet open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>Duplicate Size Guide</SheetTitle>
            <SheetDescription className="text-xs">
              Creates a copy with a fresh editable draft revision.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onDuplicateGuide} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="block text-xs font-medium text-foreground">
                New Guide Name
                <Input
                  value={duplicateName}
                  onChange={(e) => setDuplicateName(e.target.value)}
                  required
                  className="mt-1 h-9 text-xs"
                />
              </label>
            </div>
            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowDuplicateModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={duplicateBusy || !duplicateName.trim()}>
                {duplicateBusy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span>Duplicate</span>
                )}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* SHEET: CSV IMPORT */}
      <Sheet open={showImportModal} onOpenChange={setShowImportModal}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-xl">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>Import Measurement Matrix from CSV</SheetTitle>
            <SheetDescription className="text-xs">
              First column must be Size. Remaining column headers must match measurement codes:{' '}
              <span className="font-mono">{measurements.map((m) => m.code).join(', ')}</span>.
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={onImportCsv} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {importError ? (
                <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
                  {importError}
                </div>
              ) : null}
              <Textarea
                rows={10}
                value={importCsvText}
                onChange={(e) => setImportCsvText(e.target.value)}
                required
                placeholder={`Size,${measurements.map((m) => m.code).join(',')}\nS,38,27\nM,40,28\nL,42,29`}
                className="font-mono text-xs bg-card"
              />
            </div>
            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onExportCsv}
                className="text-xs text-primary"
              >
                <Download className="size-3.5 mr-1" />
                <span>Export Template</span>
              </Button>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowImportModal(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={importBusy || !importCsvText.trim()}>
                  {importBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  <span>Import Data</span>
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* DRAWER: LINKED PRODUCTS & CATEGORIES */}
      <Drawer open={showLinkedDrawer} onOpenChange={setShowLinkedDrawer}>
        <DrawerContent className="max-h-[80vh] p-4 sm:p-6">
          <DrawerHeader className="px-0 pb-3">
            <DrawerTitle>Catalog Association</DrawerTitle>
            <DrawerDescription className="text-xs">
              Products and categories currently utilizing &quot;{guide.name}&quot;.
            </DrawerDescription>
          </DrawerHeader>

          <div className="grid sm:grid-cols-2 gap-4 py-3 overflow-y-auto">
            <div>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Direct Products ({guide.products.length})
              </span>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                {guide.products.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No products directly use this chart.
                  </p>
                ) : (
                  guide.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/products/${p.id}`}
                      className="block p-2 rounded-md border border-border bg-card text-xs text-foreground hover:text-primary hover:border-primary/50 transition-colors"
                    >
                      {p.title}
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Category Defaults ({guide.categories.length})
              </span>
              <div className="mt-2 space-y-1.5 max-h-60 overflow-y-auto">
                {guide.categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    No categories have this as default.
                  </p>
                ) : (
                  guide.categories.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 rounded-md border border-border bg-card text-xs text-foreground"
                    >
                      {c.name}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
