'use client';

import React from 'react';
type CatalogProductWorkspaceDto = any;
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ProductSizingWorkspaceProps {
  product: CatalogProductWorkspaceDto;
  onRefresh: () => void;
}

export function ProductSizingWorkspace({ product }: ProductSizingWorkspaceProps) {
  if (!product.sizeGuide) {
    return (
      <Card className="mt-8 border-dashed">
        <CardHeader>
          <CardTitle>Sizing Guide</CardTitle>
          <CardDescription>No sizing guide is currently attached to this product.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To manage sizing for this product, attach a sizing chart from the Sizing Domains panel or link an existing size guide.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { sizeGuide } = product;

  // Extract all unique measurement columns from the first row (assuming uniform structure)
  const columns = sizeGuide.rows.length > 0 ? sizeGuide.rows[0].measurements.map(m => ({ name: m.name, unit: m.unit })) : [];

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Sizing Guide: {sizeGuide.name}</CardTitle>
        <CardDescription>
          {sizeGuide.instructions ? sizeGuide.instructions : 'Sizing measurements for this product.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Size</TableHead>
                {columns.map((col, i) => (
                  <TableHead key={i}>{col.name} ({col.unit})</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sizeGuide.rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  {row.measurements.map((m, j) => (
                    <TableCell key={j}>
                      {m.exact ? m.exact : `${m.min} - ${m.max}`} {m.approximate ? '(approx)' : ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
