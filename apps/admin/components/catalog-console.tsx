'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import type { ApiEnvelope, CatalogProductSummaryDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface ProductType {
  id: string;
  code: string;
  name: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('The requested catalog operation could not be completed.');
  return response.json() as Promise<T>;
}

export function CatalogConsole() {
  const [products, setProducts] = useState<readonly CatalogProductSummaryDto[]>([]);
  const [types, setTypes] = useState<readonly ProductType[]>([]);
  const [message, setMessage] = useState('');
  const [typeId, setTypeId] = useState('');

  const reload = async () => {
    try {
      const [productResult, typeResult] = await Promise.all([
        request<ApiEnvelope<readonly CatalogProductSummaryDto[]>>('/admin/catalog/products'),
        request<ApiEnvelope<readonly ProductType[]>>('/admin/catalog/product-types'),
      ]);
      setProducts(productResult.data);
      setTypes(typeResult.data);
      setTypeId((current) => current || typeResult.data[0]?.id || '');
    } catch {
      window.location.assign('/admin/login');
    }
  };
  useEffect(() => {
    void reload();
  }, []);

  async function createType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/catalog/product-types', {
        method: 'POST',
        body: JSON.stringify({ code: data.get('code'), name: data.get('name') }),
      });
      event.currentTarget.reset();
      setMessage('Product type created.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create product type.');
    }
  }
  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request('/admin/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          productTypeId: typeId,
          title: data.get('title'),
          handle: data.get('handle'),
          description: data.get('description') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Draft product created. Add options and variants before publishing.');
      await reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create product.');
    }
  }
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto grid max-w-6xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Maevelle / Catalog</p>
            <h1 className="text-3xl font-semibold tracking-tight">Product workspace</h1>
          </div>
          <nav className="flex gap-2">
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/media"
            >
              Media
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/sizing"
            >
              Sizing
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/stock"
            >
              Inventory
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/reviews"
            >
              Reviews
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/notifications"
            >
              Notifications
            </Link>
            <Link className="rounded-md border px-3 py-2 text-sm" href="/analytics">
              Analytics
            </Link>
            <Link className="rounded-md border px-3 py-2 text-sm" href="/operations">
              Operations
            </Link>
            <Button onClick={() => void reload()}>Refresh</Button>
          </nav>
        </header>
        {message ? (
          <p role="status" className="rounded-md bg-secondary px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Create product type</CardTitle>
              <CardDescription>
                Types define the product family before you create drafts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={createType}>
                <Label htmlFor="type-code">Code</Label>
                <Input
                  id="type-code"
                  name="code"
                  placeholder="dress"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
                <Label htmlFor="type-name">Name</Label>
                <Input id="type-name" name="name" placeholder="Dress" required />
                <Button type="submit">Create type</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Create draft product</CardTitle>
              <CardDescription>
                Drafts are not visible on the Storefront until publish requirements pass.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={createProduct}>
                <Label>Product type</Label>
                <Select value={typeId} onValueChange={(value) => setTypeId(value ?? '')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label htmlFor="title">Title</Label>
                <Input id="title" name="title" required />
                <Label htmlFor="handle">URL handle</Label>
                <Input
                  id="handle"
                  name="handle"
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="linen-wrap-dress"
                />
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" />
                <Button type="submit" disabled={!typeId}>
                  Create draft
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>Lifecycle status is authoritative from the API.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.title}</TableCell>
                    <TableCell>{product.handle}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          product.publicationStatus === 'PUBLISHED' ? 'default' : 'secondary'
                        }
                      >
                        {product.status} / {product.publicationStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>{product.version}</TableCell>
                  </TableRow>
                ))}
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No products yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
