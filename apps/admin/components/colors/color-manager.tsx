'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  Edit2,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import type { CatalogColorDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SettingsNav } from '@/components/settings/settings-nav';
import { catalogData, catalogRequest } from '@/lib/catalog/api';

import { OperationalFeedback, OperationalPageHeader } from '../operational-worklist';
import { ColorDeleteDialog } from './color-delete-dialog';
import { ColorDialog } from './color-dialog';
import { ColorSwatch } from './color-swatch';

type ViewMode = 'grid' | 'table';
type StatusFilter = 'ALL' | 'ACTIVE' | 'ARCHIVED';
type UsageFilter = 'ALL' | 'IN_USE' | 'UNUSED';
type SortOption = 'name_asc' | 'name_desc' | 'most_used' | 'recently_updated';

export function ColorManager() {
  const [colors, setColors] = useState<readonly CatalogColorDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [busyColorId, setBusyColorId] = useState<string | null>(null);

  // Filters & display
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('ALL');
  const [sort, setSort] = useState<SortOption>('name_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [colorToEdit, setColorToEdit] = useState<CatalogColorDto | undefined>(undefined);
  const [colorToDelete, setColorToDelete] = useState<CatalogColorDto | undefined>(undefined);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);

  const loadColors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await catalogData<CatalogColorDto[]>('/admin/catalog/colors');
      setColors(data ?? []);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to load catalog colors.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadColors();
  }, [loadColors]);

  const copyToClipboard = useCallback(async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopiedHex(hex);
      setTimeout(() => setCopiedHex(null), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  }, []);

  // Quick toggle active / archived
  async function toggleColorStatus(color: CatalogColorDto) {
    const nextStatus = color.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';
    setBusyColorId(color.id);
    try {
      const updated = await catalogData<CatalogColorDto>(`/admin/catalog/colors/${color.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setColors((prev) => prev.map((c) => (c.id === color.id ? updated : c)));
      setMessage(
        `Color "${color.name}" marked as ${nextStatus === 'ACTIVE' ? 'active' : 'archived'}.`,
      );
      setTone('success');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Failed to update color status.');
      setTone('danger');
    } finally {
      setBusyColorId(null);
    }
  }

  // Summary statistics
  const stats = useMemo(() => {
    const total = colors.length;
    const active = colors.filter((c) => c.status === 'ACTIVE').length;
    const archived = colors.filter((c) => c.status === 'ARCHIVED').length;
    const inUse = colors.filter((c) => (c.usageCount ?? 0) > 0).length;
    return { total, active, archived, inUse };
  }, [colors]);

  // Filtered & sorted colors
  const filteredColors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return colors
      .filter((color) => {
        // Search filter
        if (q) {
          const matchName = color.name.toLowerCase().includes(q);
          const matchCode = color.code.toLowerCase().includes(q);
          const matchHex = color.hexValue?.toLowerCase().includes(q);
          if (!matchName && !matchCode && !matchHex) return false;
        }

        // Status filter
        if (statusFilter !== 'ALL' && color.status !== statusFilter) {
          return false;
        }

        // Usage filter
        if (usageFilter === 'IN_USE' && (color.usageCount ?? 0) <= 0) {
          return false;
        }
        if (usageFilter === 'UNUSED' && (color.usageCount ?? 0) > 0) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case 'name_desc':
            return b.name.localeCompare(a.name);
          case 'most_used':
            return (b.usageCount ?? 0) - (a.usageCount ?? 0);
          case 'recently_updated':
            return (
              Date.parse(b.updatedAt ?? b.createdAt ?? '') -
              Date.parse(a.updatedAt ?? a.createdAt ?? '')
            );
          case 'name_asc':
          default:
            return a.name.localeCompare(b.name);
        }
      });
  }, [colors, search, statusFilter, usageFilter, sort]);

  function handleColorSaved(saved: CatalogColorDto, isNew: boolean) {
    if (isNew) {
      setColors((prev) => [saved, ...prev]);
      setMessage(`Color "${saved.name}" created successfully.`);
    } else {
      setColors((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      setMessage(`Color "${saved.name}" updated successfully.`);
    }
    setTone('success');
  }

  function handleColorDeleted(deletedId: string) {
    setColors((prev) => prev.filter((c) => c.id !== deletedId));
    setMessage('Color permanently deleted.');
    setTone('success');
  }

  function handleColorArchived(archived: CatalogColorDto) {
    setColors((prev) => prev.map((c) => (c.id === archived.id ? archived : c)));
    setMessage(`Color "${archived.name}" archived.`);
    setTone('success');
  }

  return (
    <main className="min-w-0">
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Settings / Color Library"
          title="Color Library"
          description="Standardize colors across product variants and storefront swatch selectors with exact HEX codes, status lifecycle, and real-time usage tracking."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void loadColors()}
                disabled={loading}
                className="gap-1.5"
              >
                <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setColorToEdit(undefined);
                  setDialogOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Color
              </Button>
            </div>
          }
        />

        {/* Settings Module Tab Navigation */}
        <SettingsNav />

        {/* Feedback Alert */}
        {message ? (
          <div className="mb-4">
            <OperationalFeedback tone={tone}>{message}</OperationalFeedback>
          </div>
        ) : null}

        {/* Stats Row */}
        <Stats className="mb-6">
          <StatsCard>
            <StatsTitle>Total Colors</StatsTitle>
            <StatsValue>{stats.total}</StatsValue>
            <StatsDescription>in catalog database</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Active Colors</StatsTitle>
            <StatsValue className="text-emerald-600 dark:text-emerald-400">
              {stats.active}
            </StatsValue>
            <StatsDescription>available for products</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>In Use</StatsTitle>
            <StatsValue className="text-primary">{stats.inUse}</StatsValue>
            <StatsDescription>assigned to variants</StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Archived</StatsTitle>
            <StatsValue className="text-muted-foreground">{stats.archived}</StatsValue>
            <StatsDescription>hidden from selection</StatsDescription>
          </StatsCard>
        </Stats>

        {/* Toolbar & Filters */}
        <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-card p-3 shadow-xs md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search color, code, #HEX..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 text-sm"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onValueChange={(val) => setStatusFilter(val as StatusFilter)}
            >
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active Only</SelectItem>
                <SelectItem value="ARCHIVED">Archived Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Usage Filter */}
            <Select
              value={usageFilter}
              onValueChange={(val) => setUsageFilter(val as UsageFilter)}
            >
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue placeholder="Usage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Usages</SelectItem>
                <SelectItem value="IN_USE">In Use ({stats.inUse})</SelectItem>
                <SelectItem value="UNUSED">Unused ({stats.total - stats.inUse})</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sort} onValueChange={(val) => setSort(val as SortOption)}>
              <SelectTrigger className="h-9 w-[150px] text-xs">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A → Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z → A)</SelectItem>
                <SelectItem value="most_used">Most Used</SelectItem>
                <SelectItem value="recently_updated">Recently Updated</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 self-end md:self-auto">
            <span className="text-xs text-muted-foreground mr-2 font-medium">
              {filteredColors.length} {filteredColors.length === 1 ? 'color' : 'colors'}
            </span>
            <div className="flex rounded-md border p-0.5 bg-muted/30">
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </Button>
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('table')}
                aria-label="Table view"
              >
                <List className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content Section */}
        {loading && colors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Loading color library...</p>
          </div>
        ) : filteredColors.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
              <Palette className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">No colors found</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              {search || statusFilter !== 'ALL' || usageFilter !== 'ALL'
                ? 'No colors match your selected filters. Try clearing your search query or reset filter selections.'
                : 'Your catalog does not have any standardized colors yet. Create your first color to use across products.'}
            </p>
            {search || statusFilter !== 'ALL' || usageFilter !== 'ALL' ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                  setUsageFilter('ALL');
                }}
              >
                Reset Filters
              </Button>
            ) : (
              <Button
                size="sm"
                className="mt-4 gap-1.5"
                onClick={() => {
                  setColorToEdit(undefined);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                Add First Color
              </Button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredColors.map((color) => {
              const inUse = (color.usageCount ?? 0) > 0;
              const isArchived = color.status === 'ARCHIVED';
              const isBusy = busyColorId === color.id;

              return (
                <div
                  key={color.id}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md ${
                    isArchived ? 'opacity-70 bg-muted/20' : ''
                  }`}
                >
                  {/* Top: Swatch & Header */}
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="relative">
                        <div
                          className="size-12 rounded-xl border-2 border-border shadow-xs transition-transform group-hover:scale-105"
                          style={{
                            backgroundColor: color.hexValue ?? '#ffffff',
                            backgroundImage: !color.hexValue
                              ? 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)'
                              : undefined,
                            backgroundSize: '10px 10px',
                            backgroundPosition: '0 0, 0 5px, 5px -5px, -5px 0px',
                          }}
                        />
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={isArchived ? 'secondary' : 'default'}
                          className={`text-[10px] uppercase font-semibold ${
                            isArchived
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-emerald-600 text-white dark:bg-emerald-700'
                          }`}
                        >
                          {color.status}
                        </Badge>
                        {inUse ? (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {color.usageCount} {color.usageCount === 1 ? 'variant' : 'variants'}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">Unused</span>
                        )}
                      </div>
                    </div>

                    {/* Color Info */}
                    <h4 className="font-semibold text-foreground text-sm line-clamp-1">
                      {color.name}
                    </h4>
                    <p className="font-mono text-xs text-muted-foreground line-clamp-1 mb-2">
                      {color.code}
                    </p>

                    {/* Hex Badge with quick copy */}
                    <div className="flex items-center gap-1.5 mb-4">
                      <button
                        type="button"
                        onClick={() => color.hexValue && void copyToClipboard(color.hexValue)}
                        className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="Click to copy HEX code"
                      >
                        {copiedHex === color.hexValue ? (
                          <>
                            <Check className="size-3 text-emerald-600" />
                            <span className="text-emerald-600 font-semibold">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3 opacity-60" />
                            <span>{color.hexValue ?? 'No HEX'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between border-t pt-3 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => {
                        setColorToEdit(color);
                        setDialogOpen(true);
                      }}
                    >
                      <Edit2 className="size-3.5" />
                      Edit
                    </Button>

                    <div className="flex items-center gap-1">
                      {/* Archive / Restore Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isBusy}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        title={isArchived ? 'Restore color' : 'Archive color'}
                        onClick={() => void toggleColorStatus(color)}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : isArchived ? (
                          <ArchiveRestore className="size-3.5 text-emerald-600" />
                        ) : (
                          <Archive className="size-3.5" />
                        )}
                      </Button>

                      {/* Delete Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        title="Delete color"
                        onClick={() => setColorToDelete(color)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-[80px]">Swatch</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>HEX Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Variant Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredColors.map((color) => {
                  const inUse = (color.usageCount ?? 0) > 0;
                  const isArchived = color.status === 'ARCHIVED';
                  const isBusy = busyColorId === color.id;

                  return (
                    <TableRow key={color.id} className={isArchived ? 'opacity-65' : ''}>
                      {/* Swatch */}
                      <TableCell>
                        <div
                          className="size-8 rounded-lg border shadow-xs"
                          style={{
                            backgroundColor: color.hexValue ?? '#ffffff',
                            backgroundImage: !color.hexValue
                              ? 'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)'
                              : undefined,
                            backgroundSize: '8px 8px',
                          }}
                        />
                      </TableCell>

                      {/* Name */}
                      <TableCell className="font-medium text-foreground">
                        {color.name}
                      </TableCell>

                      {/* Code */}
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {color.code}
                      </TableCell>

                      {/* HEX with quick copy */}
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => color.hexValue && void copyToClipboard(color.hexValue)}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Click to copy HEX code"
                        >
                          {copiedHex === color.hexValue ? (
                            <>
                              <Check className="size-3 text-emerald-600" />
                              <span className="text-emerald-600 font-semibold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3 opacity-60" />
                              <span>{color.hexValue ?? '—'}</span>
                            </>
                          )}
                        </button>
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        <Badge
                          variant={isArchived ? 'secondary' : 'default'}
                          className={`text-[10px] uppercase font-semibold ${
                            isArchived
                              ? 'bg-muted text-muted-foreground'
                              : 'bg-emerald-600 text-white dark:bg-emerald-700'
                          }`}
                        >
                          {color.status}
                        </Badge>
                      </TableCell>

                      {/* Usage */}
                      <TableCell>
                        {inUse ? (
                          <Badge variant="outline" className="text-xs">
                            {color.usageCount} {color.usageCount === 1 ? 'variant' : 'variants'}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Unused</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => {
                              setColorToEdit(color);
                              setDialogOpen(true);
                            }}
                          >
                            <Edit2 className="size-3.5" />
                            Edit
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            title={isArchived ? 'Restore color' : 'Archive color'}
                            onClick={() => void toggleColorStatus(color)}
                          >
                            {isBusy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : isArchived ? (
                              <ArchiveRestore className="size-3.5 text-emerald-600" />
                            ) : (
                              <Archive className="size-3.5" />
                            )}
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete color"
                            onClick={() => setColorToDelete(color)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Add/Edit Modal */}
        <ColorDialog
          open={dialogOpen}
          color={colorToEdit}
          onClose={() => {
            setDialogOpen(false);
            setColorToEdit(undefined);
          }}
          onSaved={handleColorSaved}
        />

        {/* Delete Confirmation Modal */}
        <ColorDeleteDialog
          open={Boolean(colorToDelete)}
          color={colorToDelete}
          onClose={() => setColorToDelete(undefined)}
          onDeleted={handleColorDeleted}
          onArchived={handleColorArchived}
        />
      </section>
    </main>
  );
}
