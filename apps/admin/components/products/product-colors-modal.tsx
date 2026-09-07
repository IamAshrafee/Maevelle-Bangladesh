'use client';

import { Palette } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import type { CatalogColorDto } from '@maevelle/contracts';
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
import { catalogData } from '@/lib/catalog/api';

function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function ProductColorsModal({
  colors,
  setColors,
}: {
  colors: readonly CatalogColorDto[];
  setColors: (update: (current: readonly CatalogColorDto[]) => readonly CatalogColorDto[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function addColor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return;
    setBusy(true);
    setError('');
    try {
      const color = await catalogData<CatalogColorDto>('/admin/catalog/colors', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: slug(String(data.get('code') || name)),
          hexValue: String(data.get('hexValue') ?? '').trim() || null,
        }),
      });
      setColors((current) => [...current, color]);
      form.reset();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Color could not be created.');
    } finally {
      setBusy(false);
    }
  }

  async function changeColorStatus(
    colorId: string,
    version: number,
    status: 'ACTIVE' | 'ARCHIVED',
  ) {
    setBusy(true);
    setError('');
    try {
      const color = await catalogData<CatalogColorDto>(`/admin/catalog/colors/${colorId}`, {
        method: 'PATCH',
        body: JSON.stringify({ version, status }),
      });
      setColors((current) => current.map((item) => (item.id === color.id ? color : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Color could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Palette className="mr-2 h-4 w-4" aria-hidden="true" />
        Manage Colors
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Color Library</DialogTitle>
          <DialogDescription>
            Reusable normalized Colors power swatches, filters, and Variant's primary Colors.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
          {colors.map((color) => (
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs ${color.status === 'ARCHIVED' ? 'opacity-55' : ''}`}
              key={color.id}
            >
              <span
                className="flex h-4 w-4 shrink-0 rounded-full border"
                style={{ backgroundColor: color.hexValue ?? 'transparent' }}
                aria-hidden="true"
              />
              {color.name}
              <button
                className="rounded px-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                aria-label={`${color.status === 'ACTIVE' ? 'Archive' : 'Restore'} ${color.name}`}
                disabled={busy}
                onClick={() =>
                  void changeColorStatus(
                    color.id,
                    color.version,
                    color.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
                  )
                }
              >
                {color.status === 'ACTIVE' ? '×' : '↺'}
              </button>
            </span>
          ))}
          {colors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No normalized Colors yet. Add the first one below.
            </p>
          ) : null}
        </div>

        <form
          className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_1fr_8rem_auto]"
          onSubmit={(event) => void addColor(event)}
        >
          <Input
            aria-label="Color name"
            autoComplete="off"
            name="name"
            placeholder="Example: Crimson…"
            required
          />
          <Input aria-label="Color code" autoComplete="off" name="code" placeholder="Auto code…" />
          <Input
            aria-label="Color hex value"
            autoComplete="off"
            name="hexValue"
            pattern="#[0-9a-fA-F]{6}"
            placeholder="#DC143C"
          />
          <Button type="submit" disabled={busy}>
            Add Color
          </Button>
        </form>
        {error ? (
          <p className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
