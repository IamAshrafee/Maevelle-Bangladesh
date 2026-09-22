'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Palette } from 'lucide-react';

import type { CatalogColorDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { catalogData } from '@/lib/catalog/api';

import { ColorSwatch } from './color-swatch';
import {
  POPULAR_COLOR_PRESETS,
  colorFormSchema,
  slugifyColorCode,
  type ColorFormValues,
} from './color-types';

interface ColorDialogProps {
  open: boolean;
  color?: CatalogColorDto | undefined;
  onClose: () => void;
  onSaved: (color: CatalogColorDto, isNew: boolean) => void;
}

export function ColorDialog({ open, color, onClose, onSaved }: ColorDialogProps) {
  const isEditing = Boolean(color);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(isEditing);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const form = useForm<ColorFormValues>({
    resolver: zodResolver(colorFormSchema),
    defaultValues: {
      name: '',
      code: '',
      hexValue: '#000000',
      status: 'ACTIVE',
    },
  });

  useEffect(() => {
    if (open) {
      setError('');
      if (color) {
        form.reset({
          name: color.name,
          code: color.code,
          hexValue: color.hexValue ?? '#000000',
          status: color.status,
        });
        setCodeManuallyEdited(true);
      } else {
        form.reset({
          name: '',
          code: '',
          hexValue: '#000000',
          status: 'ACTIVE',
        });
        setCodeManuallyEdited(false);
      }
    }
  }, [open, color, form]);

  const currentHex = form.watch('hexValue');
  const currentName = form.watch('name');

  async function onSubmit(values: ColorFormValues) {
    setSaving(true);
    setError('');

    try {
      if (isEditing && color) {
        const updated = await catalogData<CatalogColorDto>(`/admin/catalog/colors/${color.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: color.version,
            name: values.name.trim(),
            code: values.code.trim().toLowerCase(),
            hexValue: values.hexValue ? values.hexValue.trim().toUpperCase() : null,
            status: values.status,
          }),
        });
        onSaved(updated, false);
      } else {
        const created = await catalogData<CatalogColorDto>('/admin/catalog/colors', {
          method: 'POST',
          body: JSON.stringify({
            name: values.name.trim(),
            code: values.code.trim().toLowerCase(),
            hexValue: values.hexValue ? values.hexValue.trim().toUpperCase() : null,
          }),
        });
        onSaved(created, true);
      }
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to save color.');
    } finally {
      setSaving(false);
    }
  }

  function handlePresetClick(preset: { name: string; hex: string }) {
    form.setValue('hexValue', preset.hex, { shouldValidate: true, shouldDirty: true });
    if (!form.getValues('name') || !isEditing) {
      form.setValue('name', preset.name, { shouldValidate: true, shouldDirty: true });
      if (!codeManuallyEdited) {
        form.setValue('code', slugifyColorCode(preset.name), {
          shouldValidate: true,
          shouldDirty: true,
        });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && !next && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="size-5 text-primary" />
            {isEditing ? `Edit Color: ${color?.name}` : 'Add New Color'}
          </DialogTitle>
          <DialogDescription>
            Normalized colors are shared catalog-wide across product variants, swatches, and
            filters.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          {error && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Live Preview Box */}
          <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <ColorSwatch
                hexValue={currentHex}
                name={currentName || 'Preview'}
                size="xl"
                showHex
              />
            </div>
            <div className="text-right">
              <span className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </span>
              <span className="text-sm font-medium">
                {form.watch('status') === 'ACTIVE' ? 'Active' : 'Archived'}
              </span>
            </div>
          </div>

          {/* Name & Code */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="color-name">Color Name *</Label>
              <Input
                id="color-name"
                autoComplete="off"
                placeholder="e.g. Forest Green"
                {...form.register('name')}
                onChange={(e) => {
                  const val = e.target.value;
                  form.setValue('name', val, { shouldValidate: true, shouldDirty: true });
                  if (!codeManuallyEdited) {
                    form.setValue('code', slugifyColorCode(val), {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }
                }}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="color-code">Unique Code *</Label>
              <Input
                id="color-code"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                placeholder="forest-green"
                {...form.register('code')}
                onChange={(e) => {
                  setCodeManuallyEdited(true);
                  form.setValue('code', e.target.value.toLowerCase(), {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
          </div>

          {/* Hex Value & Color Picker */}
          <div className="space-y-2">
            <Label htmlFor="color-hex">HEX Color Value</Label>
            <div className="flex items-center gap-3">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border shadow-xs">
                <input
                  type="color"
                  value={currentHex && /^#[0-9a-fA-F]{6}$/.test(currentHex) ? currentHex : '#000000'}
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  onChange={(e) => {
                    form.setValue('hexValue', e.target.value.toUpperCase(), {
                      shouldValidate: true,
                      shouldDirty: true,
                    });
                  }}
                  title="Pick a color"
                />
                <div
                  className="size-full"
                  style={{
                    backgroundColor:
                      currentHex && /^#[0-9a-fA-F]{6}$/.test(currentHex)
                        ? currentHex
                        : 'transparent',
                  }}
                />
              </div>
              <Input
                id="color-hex"
                autoComplete="off"
                placeholder="#000000"
                className="font-mono uppercase"
                maxLength={7}
                {...form.register('hexValue')}
                onChange={(e) => {
                  form.setValue('hexValue', e.target.value.toUpperCase(), {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
            </div>
            {form.formState.errors.hexValue && (
              <p className="text-xs text-destructive">{form.formState.errors.hexValue.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Click the square swatch to launch the native color picker, or type any 6-digit hex
              value directly.
            </p>
          </div>

          {/* Preset Color Swatches */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Quick Palette Presets</Label>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2 bg-background">
              {POPULAR_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handlePresetClick(preset)}
                  title={`${preset.name} (${preset.hex})`}
                  className="group relative flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="size-3.5 rounded-full border shadow-2xs"
                    style={{ backgroundColor: preset.hex }}
                    aria-hidden="true"
                  />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-2">
            <Label htmlFor="color-status">Lifecycle Status</Label>
            <Select
              value={form.watch('status')}
              onValueChange={(val) =>
                form.setValue('status', val as 'ACTIVE' | 'ARCHIVED', {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger id="color-status">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active (Available for products)</SelectItem>
                <SelectItem value="ARCHIVED">Archived (Hidden from new selections)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Archiving a color prevents new products from picking it, while preserving existing
              variants.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Saving…
                </>
              ) : isEditing ? (
                'Save Changes'
              ) : (
                'Create Color'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
