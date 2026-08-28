'use client';

import { Plus, Search, Settings, Save, X, Network, Tags, RefreshCcw } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';

import type { CatalogCategoryDto, CatalogCategoryStatusDto } from '@maevelle/contracts';

import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

class ApiRequestError extends Error {
  public constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string } | string;
    };
    const code = typeof body.error === 'object' ? body.error.code : body.error;
    const detail = typeof body.error === 'object' ? (body.error.message ?? code) : body.error;
    throw new ApiRequestError(
      detail ?? 'The requested catalog operation could not be completed.',
      code,
      response.status,
    );
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as { data: T }).data;
}

export function CategoryConsole() {
  const [categories, setCategories] = useState<readonly CatalogCategoryDto[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  
  // Selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  
  // Edit State
  const [editingCategory, setEditingCategory] = useState<CatalogCategoryDto | null>(null);
  const [editName, setEditName] = useState('');
  const [editHandle, setEditHandle] = useState('');
  const [editStatus, setEditStatus] = useState<CatalogCategoryStatusDto>('ACTIVE');
  const [editParent, setEditParent] = useState<string | null>(null);
  const [editPosition, setEditPosition] = useState<number>(0);
  
  const [saving, setSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const loadCategories = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const data = await request<readonly CatalogCategoryDto[]>('/admin/catalog/category-tree');
      setCategories(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadCategories();
  }, []);

  const selectCategory = (category: CatalogCategoryDto) => {
    setIsCreating(false);
    setSelectedCategoryId(category.id);
    setEditingCategory(category);
    setEditName(category.name);
    setEditHandle(category.handle);
    setEditStatus(category.status);
    setEditParent(category.parentCategoryId);
    setEditPosition(category.position);
  };

  const clearSelection = () => {
    setSelectedCategoryId(null);
    setEditingCategory(null);
    setIsCreating(false);
  };

  const startCreate = () => {
    clearSelection();
    setIsCreating(true);
    setEditName('');
    setEditHandle('');
    setEditStatus('ACTIVE');
    setEditParent(null);
    setEditPosition(0);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isCreating) {
        await request('/admin/catalog/categories', {
          method: 'POST',
          body: JSON.stringify({
            name: editName,
            handle: editHandle,
            parentCategoryId: editParent || undefined,
          }),
        });
      } else if (editingCategory) {
        await request(`/admin/catalog/categories/${editingCategory.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: editingCategory.version,
            name: editName !== editingCategory.name ? editName : undefined,
            handle: editHandle !== editingCategory.handle ? editHandle : undefined,
            status: editStatus !== editingCategory.status ? editStatus : undefined,
            parentCategoryId: editParent !== editingCategory.parentCategoryId ? (editParent || null) : undefined,
            position: editPosition !== editingCategory.position ? editPosition : undefined,
          }),
        });
      }
      await loadCategories();
      clearSelection();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()) || 
    c.handle.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex h-full w-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground">Manage your catalog classification hierarchy.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={loadCategories} disabled={busy}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={startCreate} disabled={busy || saving}>
            <Plus className="mr-2 h-4 w-4" />
            New category
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar List */}
        <aside className="flex w-1/3 min-w-[320px] flex-col border-r bg-muted/20">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search categories..."
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2">
            {busy && categories.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Loading categories...</div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-red-500">{error}</div>
            ) : filteredCategories.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No categories found.</div>
            ) : (
              <ul className="space-y-1">
                {filteredCategories.map((category) => (
                  <li key={category.id}>
                    <button
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                        selectedCategoryId === category.id ? 'bg-primary/10 font-medium text-primary' : ''
                      }`}
                      onClick={() => selectCategory(category)}
                    >
                      <div className="flex flex-col gap-1 overflow-hidden">
                        <span className="truncate">{category.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{category.path}</span>
                      </div>
                      <StatusBadge status={category.effectiveStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {(isCreating || editingCategory) ? (
            <div className="mx-auto max-w-2xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {isCreating ? 'Create Category' : 'Edit Category'}
                </h2>
                <Button variant="ghost" size="icon" onClick={clearSelection}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid gap-4 rounded-lg border bg-card p-6 shadow-sm">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="e.g. Dresses"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="handle">Handle (URL Slug)</Label>
                    <Input
                      id="handle"
                      required
                      value={editHandle}
                      onChange={(e) => setEditHandle(e.target.value)}
                      placeholder="e.g. dresses"
                      pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                      title="Only lowercase alphanumeric characters and hyphens allowed."
                    />
                    <p className="text-xs text-muted-foreground">
                      Handles are used in URLs. Changing this will record a redirect history.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="parent">Parent Category</Label>
                    <Select
                      value={editParent || 'NONE'}
                      onValueChange={(val) => setEditParent(val === 'NONE' ? null : val)}
                    >
                      <SelectTrigger id="parent">
                        <SelectValue placeholder="No Parent (Root)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">No Parent (Root)</SelectItem>
                        {categories
                          .filter((c) => c.id !== editingCategory?.id)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.path}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!isCreating && (
                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={editStatus}
                        onValueChange={(val) => setEditStatus(val as CatalogCategoryStatusDto)}
                      >
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Active</SelectItem>
                          <SelectItem value="INACTIVE">Inactive</SelectItem>
                          <SelectItem value="ARCHIVED">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      {editingCategory?.effectiveStatus === 'INACTIVE' && (
                        <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                          <strong>Note:</strong> This category is effectively inactive because{' '}
                          {editingCategory.effectiveStatusReason === 'ANCESTOR_INACTIVE' 
                            ? 'an ancestor category is inactive.' 
                            : 'it is set to inactive.'}
                        </div>
                      )}
                    </div>
                  )}

                  {!isCreating && (
                    <div className="grid gap-2">
                      <Label htmlFor="position">Position (Order)</Label>
                      <Input
                        id="position"
                        type="number"
                        min="0"
                        required
                        value={editPosition}
                        onChange={(e) => setEditPosition(Number(e.target.value))}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={clearSelection} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : isCreating ? 'Create' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Network className="mb-4 h-12 w-12 opacity-20" />
              <p>Select a category to view or edit details.</p>
              <p className="mt-2 text-sm">
                Or <button type="button" className="text-primary hover:underline" onClick={startCreate}>create a new one</button>.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
