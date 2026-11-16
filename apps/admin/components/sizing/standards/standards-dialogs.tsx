'use client';

import type { FormEvent } from 'react';

import type {
  MeasurementDefinitionDto,
  SizeDefinitionDto,
  SizeSystemDto,
  SizingDomainDto,
} from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
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

interface StandardsDialogsProps {
  activeDomains: readonly SizingDomainDto[];
  activeSystems: readonly SizeSystemDto[];
  domainModalOpen: boolean;
  setDomainModalOpen: (open: boolean) => void;
  editingDomain: SizingDomainDto | null;
  onSaveDomain: (e: FormEvent<HTMLFormElement>) => void;
  systemModalOpen: boolean;
  setSystemModalOpen: (open: boolean) => void;
  editingSystem: SizeSystemDto | null;
  systemParentDomainId: string;
  onSaveSystem: (e: FormEvent<HTMLFormElement>) => void;
  sizeModalOpen: boolean;
  setSizeModalOpen: (open: boolean) => void;
  editingSize: SizeDefinitionDto | null;
  sizeParentSystemId: string;
  onSaveSize: (e: FormEvent<HTMLFormElement>) => void;
  measurementModalOpen: boolean;
  setMeasurementModalOpen: (open: boolean) => void;
  editingMeasurement: MeasurementDefinitionDto | null;
  measurementParentDomainId: string;
  onSaveMeasurement: (e: FormEvent<HTMLFormElement>) => void;
}

export function StandardsDialogs({
  activeDomains,
  activeSystems,
  domainModalOpen,
  setDomainModalOpen,
  editingDomain,
  onSaveDomain,
  systemModalOpen,
  setSystemModalOpen,
  editingSystem,
  systemParentDomainId,
  onSaveSystem,
  sizeModalOpen,
  setSizeModalOpen,
  editingSize,
  sizeParentSystemId,
  onSaveSize,
  measurementModalOpen,
  setMeasurementModalOpen,
  editingMeasurement,
  measurementParentDomainId,
  onSaveMeasurement,
}: StandardsDialogsProps) {
  return (
    <>
      {/* SHEET 1: CREATE / EDIT DOMAIN */}
      <Sheet open={domainModalOpen} onOpenChange={setDomainModalOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{editingDomain ? 'Edit Sizing Domain' : 'Create Sizing Domain'}</SheetTitle>
            <SheetDescription className="text-xs">
              Sizing domains represent broad product sectors (Womenswear, Menswear, Kids, Footwear).
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingDomain?.id ?? 'new-domain'}
            onSubmit={onSaveDomain}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <label className="block text-xs font-medium text-foreground">
                Domain Name
                <Input
                  name="name"
                  defaultValue={editingDomain?.name ?? ''}
                  required
                  placeholder="e.g. Womenswear, Menswear, Footwear"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              {!editingDomain ? (
                <>
                  <label className="block text-xs font-medium text-foreground">
                    Identifier Code
                    <Input
                      name="code"
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      placeholder="e.g. womenswear, footwear"
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </label>
                  <label className="block text-xs font-medium text-foreground">
                    Measurement Subject
                    <NativeSelect
                      name="subjectType"
                      defaultValue="GARMENT"
                      className="mt-1 h-9 text-xs bg-card"
                    >
                      <option value="GARMENT">Garment (Measured on the product)</option>
                      <option value="BODY">Body (Measured on customer body)</option>
                      <option value="PRODUCT">Product (Footwear, accessories)</option>
                    </NativeSelect>
                  </label>
                </>
              ) : null}
            </div>

            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDomainModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingDomain ? 'Update Domain' : 'Create Domain'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* SHEET 2: CREATE / EDIT SYSTEM */}
      <Sheet open={systemModalOpen} onOpenChange={setSystemModalOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{editingSystem ? 'Edit Size System' : 'Create Size System'}</SheetTitle>
            <SheetDescription className="text-xs">
              Size systems standardize sizes within a domain (e.g. International Alpha, EU Numeric).
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingSystem?.id ?? `new-system-${systemParentDomainId}`}
            onSubmit={onSaveSystem}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {!editingSystem ? (
                <label className="block text-xs font-medium text-foreground">
                  Parent Domain
                  <NativeSelect
                    name="sizingDomainId"
                    defaultValue={systemParentDomainId}
                    required
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    {activeDomains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ) : null}

              <label className="block text-xs font-medium text-foreground">
                System Name
                <Input
                  name="name"
                  defaultValue={editingSystem?.name ?? ''}
                  required
                  placeholder="e.g. International Alpha (XS–3XL)"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              {!editingSystem ? (
                <label className="block text-xs font-medium text-foreground">
                  Identifier Code
                  <Input
                    name="code"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="e.g. intl-alpha, eu-numeric"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                </label>
              ) : null}

              <label className="block text-xs font-medium text-foreground">
                Market / Region Code{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
                <Input
                  name="regionCode"
                  defaultValue={editingSystem?.regionCode ?? ''}
                  placeholder="e.g. INTL, EU, UK, US"
                  className="mt-1 h-9 text-xs"
                />
              </label>
            </div>

            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSystemModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingSystem ? 'Update System' : 'Create System'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* SHEET 3: CREATE / EDIT SIZE DEFINITION */}
      <Sheet open={sizeModalOpen} onOpenChange={setSizeModalOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>{editingSize ? 'Edit Size Definition' : 'Add Size Definition'}</SheetTitle>
            <SheetDescription className="text-xs">
              A canonical size label within a system (e.g. S, M, L, XL, 38, 40).
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingSize?.id ?? `new-size-${sizeParentSystemId}`}
            onSubmit={onSaveSize}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {!editingSize ? (
                <label className="block text-xs font-medium text-foreground">
                  Size System
                  <NativeSelect
                    name="sizeSystemId"
                    defaultValue={sizeParentSystemId}
                    required
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    {activeSystems.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ) : null}

              <label className="block text-xs font-medium text-foreground">
                Display Label
                <Input
                  name="label"
                  defaultValue={editingSize?.label ?? ''}
                  required
                  placeholder="e.g. Medium, M, EU 38, UK 10"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              {!editingSize ? (
                <label className="block text-xs font-medium text-foreground">
                  Identifier Code
                  <Input
                    name="code"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="e.g. m, eu-38, uk-10"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                </label>
              ) : null}

              <label className="block text-xs font-medium text-foreground">
                Deterministic Sort Order
                <Input
                  name="sortOrder"
                  type="number"
                  min="0"
                  defaultValue={editingSize?.sortOrder ?? 10}
                  required
                  className="mt-1 h-9 font-mono text-xs tabular-nums"
                />
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  Lower numbers display first (e.g. XS = 10, S = 20, M = 30, L = 40).
                </span>
              </label>
            </div>

            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSizeModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingSize ? 'Update Size' : 'Add Size'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* SHEET 4: CREATE / EDIT MEASUREMENT DIMENSION */}
      <Sheet open={measurementModalOpen} onOpenChange={setMeasurementModalOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle>
              {editingMeasurement ? 'Edit Measurement Dimension' : 'Add Measurement Dimension'}
            </SheetTitle>
            <SheetDescription className="text-xs">
              Reusable measurement column for charts (Chest, Waist, Inseam, Total Length).
            </SheetDescription>
          </SheetHeader>
          <form
            key={editingMeasurement?.id ?? `new-measurement-${measurementParentDomainId}`}
            onSubmit={onSaveMeasurement}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
              {!editingMeasurement ? (
                <label className="block text-xs font-medium text-foreground">
                  Sizing Domain
                  <NativeSelect
                    name="sizingDomainId"
                    defaultValue={measurementParentDomainId}
                    required
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    {activeDomains.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ) : null}

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-foreground">
                  Dimension Name
                  <Input
                    name="name"
                    defaultValue={editingMeasurement?.name ?? ''}
                    required
                    placeholder="e.g. Chest Around, Waist, Length"
                    className="mt-1 h-9 text-xs"
                  />
                </label>

                {!editingMeasurement ? (
                  <label className="block text-xs font-medium text-foreground">
                    Identifier Code
                    <Input
                      name="code"
                      required
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      placeholder="e.g. chest, waist, length"
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </label>
                ) : null}
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-xs font-medium text-foreground">
                  Default Unit
                  <NativeSelect
                    name="defaultUnit"
                    defaultValue={editingMeasurement?.defaultUnit ?? 'inch'}
                    className="mt-1 h-9 text-xs bg-card"
                  >
                    <option value="inch">Inches (inch)</option>
                    <option value="cm">Centimeters (cm)</option>
                    <option value="kg">Kilograms (kg)</option>
                  </NativeSelect>
                </label>

                {!editingMeasurement ? (
                  <label className="block text-xs font-medium text-foreground">
                    Subject Type
                    <NativeSelect
                      name="subjectType"
                      defaultValue="GARMENT"
                      className="mt-1 h-9 text-xs bg-card"
                    >
                      <option value="GARMENT">Garment</option>
                      <option value="BODY">Body</option>
                      <option value="PRODUCT">Product</option>
                    </NativeSelect>
                  </label>
                ) : null}
              </div>

              <label className="block text-xs font-medium text-foreground">
                Description <span className="text-muted-foreground font-normal">(optional)</span>
                <Input
                  name="description"
                  defaultValue={editingMeasurement?.description ?? ''}
                  placeholder="What this dimension represents"
                  className="mt-1 h-9 text-xs"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                Measuring Instructions{' '}
                <span className="text-muted-foreground font-normal">(optional)</span>
                <Textarea
                  name="instructions"
                  rows={2}
                  defaultValue={editingMeasurement?.instructions ?? ''}
                  placeholder="How operators or customers should measure this dimension…"
                  className="mt-1 text-xs bg-card"
                />
              </label>

              <label className="block text-xs font-medium text-foreground">
                Sort Order
                <Input
                  name="sortOrder"
                  type="number"
                  min="0"
                  defaultValue={editingMeasurement?.sortOrder ?? 10}
                  className="mt-1 h-9 font-mono text-xs tabular-nums"
                />
              </label>
            </div>

            <SheetFooter className="border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMeasurementModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                {editingMeasurement ? 'Update Dimension' : 'Add Dimension'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
