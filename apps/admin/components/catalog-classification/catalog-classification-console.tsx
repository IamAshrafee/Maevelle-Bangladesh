'use client';

import {
  Boxes,
  CalendarHeart,
  CircleHelp,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Tags,
} from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';

import type {
  CatalogCategoryDto,
  CatalogCategoryListDto,
  CatalogCategoryStatusDto,
  CatalogVocabularyItemDto,
  CatalogVocabularyKindDto,
  CatalogVocabularyListDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import { fetchSizeGuides } from '@/lib/sizing/api';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Stats, StatsCard, StatsTitle, StatsValue } from '@/components/ui/stats';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { categoryListPath, classificationRequest, vocabularyListPath } from './classification-api';
import { ClassificationDialog, type ClassificationFormValue } from './classification-dialog';
import { ClassificationHelp } from './classification-help';

type TabKey = 'CATEGORY' | CatalogVocabularyKindDto;
type EditableItem = CatalogCategoryDto | CatalogVocabularyItemDto;

const tabs: readonly {
  key: TabKey;
  label: string;
  icon: typeof FolderTree;
  help: string;
}[] = [
  {
    key: 'CATEGORY',
    label: 'Categories',
    icon: FolderTree,
    help: 'Customer browsing hierarchy',
  },
  { key: 'TAG', label: 'Tags', icon: Tags, help: 'Flexible product labels' },
  {
    key: 'OCCASION',
    label: 'Occasions',
    icon: CalendarHeart,
    help: 'Wedding, Eid, Party, and more',
  },
  {
    key: 'COLLECTION',
    label: 'Collections',
    icon: Boxes,
    help: 'Campaign and merchandising groups',
  },
];

const emptySummary = { total: 0, active: 0, inactive: 0, archived: 0 };

export function CatalogClassificationConsole() {
  const [tab, setTab] = useState<TabKey>('CATEGORY');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState<CatalogCategoryStatusDto | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState<readonly CatalogCategoryDto[]>([]);
  const [vocabulary, setVocabulary] = useState<readonly CatalogVocabularyItemDto[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<readonly CatalogCategoryDto[]>([]);
  const [sizeGuides, setSizeGuides] = useState<readonly SizeGuideSummaryDto[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [editing, setEditing] = useState<EditableItem>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setMessage('');
    try {
      if (tab === 'CATEGORY') {
        const result = await classificationRequest<CatalogCategoryListDto>(
          categoryListPath({ page, query: deferredQuery, status }),
          signal ? { signal } : undefined,
        );
        setCategories(result.items);
        setSummary(result.summary);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.totalItems);
      } else {
        const result = await classificationRequest<CatalogVocabularyListDto>(
          vocabularyListPath({ kind: tab, page, query: deferredQuery, status }),
          signal ? { signal } : undefined,
        );
        setVocabulary(result.items);
        setSummary(result.summary);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.totalItems);
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setMessage(error instanceof Error ? error.message : 'Unable to load product organization.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [tab, deferredQuery, status, page]);

  async function refreshCategoryOptions() {
    const firstPage = await classificationRequest<CatalogCategoryListDto>(
      categoryListPath({ page: 1, pageSize: 100 }),
    );
    const remainingPages = await Promise.all(
      Array.from({ length: Math.max(0, firstPage.pagination.totalPages - 1) }, (_, index) =>
        classificationRequest<CatalogCategoryListDto>(
          categoryListPath({ page: index + 2, pageSize: 100 }),
        ),
      ),
    );
    setCategoryOptions([
      ...firstPage.items,
      ...remainingPages.flatMap((result) => result.items),
    ]);
  }

  useEffect(() => {
    void refreshCategoryOptions().catch(() => undefined);
    void fetchSizeGuides().then(setSizeGuides).catch(() => undefined);
  }, []);

  function switchTab(next: TabKey) {
    setTab(next);
    setPage(1);
    setQuery('');
    setStatus('ALL');
  }

  function openCreate() {
    setEditing(undefined);
    setFormError(undefined);
    setDialogOpen(true);
  }

  function openEdit(item: EditableItem) {
    setEditing(item);
    setFormError(undefined);
    setDialogOpen(true);
  }

  async function save(value: ClassificationFormValue) {
    setSaving(true);
    setFormError(undefined);
    try {
      if (tab === 'CATEGORY') {
        const body = {
          name: value.name,
          handle: value.handle,
          status: value.status,
          parentCategoryId: value.parentCategoryId,
          position: value.position,
          defaultSizeGuideId: value.defaultSizeGuideId ?? null,
        };
        await classificationRequest(
          editing ? `/admin/catalog/categories/${editing.id}` : '/admin/catalog/categories',
          {
            method: editing ? 'PATCH' : 'POST',
            body: JSON.stringify(
              editing
                ? {
                    ...body,
                    version: editing.version,
                    parentCategoryId: value.parentCategoryId ?? null,
                    defaultSizeGuideId: value.defaultSizeGuideId ?? null,
                  }
                : body,
            ),
          },
        );
      } else {
        const body = {
          name: value.name,
          handle: value.handle,
          description: value.description || null,
          status: value.status,
          position: value.position,
        };
        await classificationRequest(
          editing
            ? `/admin/catalog/vocabulary/${tab}/${editing.id}`
            : `/admin/catalog/vocabulary/${tab}`,
          {
            method: editing ? 'PATCH' : 'POST',
            body: JSON.stringify(editing ? { ...body, version: editing.version } : body),
          },
        );
      }
      setDialogOpen(false);
      setEditing(undefined);
      await load();
      await refreshCategoryOptions();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to save this item.');
    } finally {
      setSaving(false);
    }
  }

  const currentTab = tabs.find((item) => item.key === tab)!;
  const rows: readonly EditableItem[] = tab === 'CATEGORY' ? categories : vocabulary;

  return (
    <main className="mx-auto grid w-full max-w-[1500px] gap-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Catalog setup</p>
          <h1 className="text-2xl font-semibold tracking-tight">Product organization</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Manage categories, tags, occasions, and collections in one place. Products use these
            values for browsing, merchandising, and fast internal workflows.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            title="See examples and learn which type to use"
            variant="outline"
            onClick={() => setHelpOpen(true)}
          >
            <CircleHelp /> How it works
          </Button>
          <Button onClick={openCreate}>
            <Plus /> Create {currentTab.label.slice(0, -1)}
          </Button>
        </div>
      </header>

      <Tabs value={tab} onValueChange={(value) => switchTab(value as TabKey)}>
        <TabsList className="h-auto w-full justify-start overflow-x-auto" variant="line">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} title={item.help} value={item.key}>
              <item.icon /> {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Stats aria-label="Classification totals">
        {(
          [
            ['Total', summary.total],
            ['Active', summary.active],
            ['Inactive', summary.inactive],
            ['Archived', summary.archived],
          ] as const
        ).map(([label, value]) => (
          <StatsCard key={label}>
            <StatsTitle>{label}</StatsTitle>
            <StatsValue>{value}</StatsValue>
          </StatsCard>
        ))}
      </Stats>

      <Card>
        <CardHeader className="gap-4 border-b md:grid-cols-[1fr_auto]">
          <div>
            <CardTitle>{currentTab.label}</CardTitle>
            <p className="text-sm text-muted-foreground">{currentTab.help}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="w-full pl-9 sm:w-72"
                placeholder={`Search ${currentTab.label.toLowerCase()}…`}
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as CatalogCategoryStatusDto | 'ALL');
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-40" title="Filter by configured status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
                <SelectItem value="ARCHIVED">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {message ? (
            <p className="m-4 rounded-md bg-destructive/10 p-3 text-destructive" role="alert">
              {message}
            </p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                {tab === 'CATEGORY' ? (
                  <>
                    <TableHead>Children</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Size Guide</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Description</TableHead>
                    <TableHead>Products</TableHead>
                  </>
                )}
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => {
                const category = 'path' in item ? item : undefined;
                const vocabularyItem = 'kind' in item ? item : undefined;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="grid min-w-56">
                        <strong>{item.name}</strong>
                        <span className="text-xs text-muted-foreground">
                          {category?.path ??
                            (vocabularyItem?.kind === 'OCCASION'
                              ? 'Occasion or event'
                              : vocabularyItem?.kind.toLowerCase())}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code>{item.handle}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={item.status === 'ACTIVE' ? 'secondary' : 'outline'}>
                          {item.status}
                        </Badge>
                        {category?.effectiveStatusReason === 'ANCESTOR_INACTIVE' ? (
                          <Badge title="A parent category is inactive" variant="outline">
                            Parent inactive
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    {category ? (
                      <>
                        <TableCell>{category.childCount}</TableCell>
                        <TableCell>{category.productCount}</TableCell>
                        <TableCell>
                          {category.defaultSizeGuideName ? (
                            <Badge className="font-normal text-xs" variant="outline">
                              {category.defaultSizeGuideName}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="max-w-80 truncate text-muted-foreground">
                          {vocabularyItem?.description || '—'}
                        </TableCell>
                        <TableCell>{vocabularyItem?.productCount ?? 0}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <Button
                        aria-label={`Edit ${item.name}`}
                        size="icon-sm"
                        title={`Edit ${item.name}`}
                        variant="ghost"
                        onClick={() => openEdit(item)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell className="h-36 text-center text-muted-foreground" colSpan={7}>
                    No {currentTab.label.toLowerCase()} match these filters. Create the first one or
                    clear the filters.
                  </TableCell>
                </TableRow>
              ) : null}
              {loading ? (
                <TableRow>
                  <TableCell className="h-28 text-center text-muted-foreground" colSpan={7}>
                    Loading {currentTab.label.toLowerCase()}…
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
        <footer className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {totalItems} result{totalItems === 1 ? '' : 's'} · Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              disabled={page <= 1 || loading}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Previous
            </Button>
            <Button
              disabled={page >= totalPages || loading}
              size="sm"
              variant="outline"
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </footer>
      </Card>

      <ClassificationDialog
        categoryMode={tab === 'CATEGORY'}
        categories={categoryOptions}
        sizeGuides={sizeGuides}
        {...(formError === undefined ? {} : { error: formError })}
        {...(editing === undefined ? {} : { item: editing })}
        kind={tab === 'CATEGORY' ? 'TAG' : tab}
        open={dialogOpen}
        saving={saving}
        onOpenChange={setDialogOpen}
        onSave={save}
      />
      <ClassificationHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </main>
  );
}
