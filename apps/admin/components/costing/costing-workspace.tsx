'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Layers, ArrowUpRight, TrendingUp, DollarSign } from 'lucide-react';

export function CostingWorkspace({ layers, assignments, cogs, valuation }: { layers: any[], assignments: any[], cogs: any[], valuation: any[] }) {
  const [tab, setTab] = useState<'valuation' | 'layers' | 'outbound' | 'cogs'>('valuation');

  const formatMoney = (amount: string, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dateString));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 border-b pb-4">
        <button 
          onClick={() => setTab('valuation')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${tab === 'valuation' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
        >
          <DollarSign className="w-4 h-4" /> Inventory Valuation
        </button>
        <button 
          onClick={() => setTab('layers')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${tab === 'layers' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
        >
          <Layers className="w-4 h-4" /> Cost Layers (FIFO)
        </button>
        <button 
          onClick={() => setTab('outbound')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${tab === 'outbound' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
        >
          <ArrowUpRight className="w-4 h-4" /> Outbound Assignments
        </button>
        <button 
          onClick={() => setTab('cogs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-medium ${tab === 'cogs' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
        >
          <TrendingUp className="w-4 h-4" /> Recognized COGS
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-right-4">
        {tab === 'valuation' && (
          <Card>
            <CardHeader>
              <CardTitle>Current Inventory Valuation</CardTitle>
              <CardDescription>Estimated total value of on-hand inventory based on historical cost layers.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Product Title</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Condition</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Total Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valuation.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No valuation data available.</TableCell></TableRow>
                    ) : (
                      valuation.map((v, i) => (
                        <TableRow key={`${v.inventory_item_id}-${i}`}>
                          <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                          <TableCell className="font-medium text-sm">{v.product_title}</TableCell>
                          <TableCell className="text-sm">{v.location_name}</TableCell>
                          <TableCell><Badge variant="secondary">{v.condition_code}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{v.quantity}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{formatMoney(v.value, v.currency_code)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'layers' && (
          <Card>
            <CardHeader>
              <CardTitle>FIFO Cost Layers</CardTitle>
              <CardDescription>Chronological batches of inventory receipts and their established landed costs.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Received At</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Receipt Ref</TableHead>
                      <TableHead className="text-right">Remaining / Original</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {layers.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No cost layers found.</TableCell></TableRow>
                    ) : (
                      layers.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(l.received_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                          <TableCell className="text-xs">{l.receipt_number}</TableCell>
                          <TableCell className="text-right text-sm">
                            <span className="font-medium">{l.remaining_quantity}</span> <span className="text-muted-foreground">/ {l.original_quantity}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatMoney(l.effective_cost, l.currency_code)}</TableCell>
                          <TableCell>
                            <Badge variant={l.cost_state === 'FINAL' ? 'success' as any : 'warning' as any}>{l.cost_state}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'outbound' && (
          <Card>
            <CardHeader>
              <CardTitle>Outbound Assignments</CardTitle>
              <CardDescription>Pending cost relief for dispatched fulfillments not yet delivered.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Assigned Cost</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No active outbound assignments.</TableCell></TableRow>
                    ) : (
                      assignments.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs text-primary">{a.order_number}</TableCell>
                          <TableCell className="font-mono text-xs">{a.sku}</TableCell>
                          <TableCell className="text-right text-sm">{a.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium">{formatMoney(a.total_cost, a.currency_code)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{a.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === 'cogs' && (
          <Card>
            <CardHeader>
              <CardTitle>Recognized COGS</CardTitle>
              <CardDescription>Finalized Cost of Goods Sold for completed deliveries.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead>Recognized At</TableHead>
                      <TableHead>Order Ref</TableHead>
                      <TableHead>Delivery Ref</TableHead>
                      <TableHead className="text-right">Total COGS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cogs.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No COGS recognized yet.</TableCell></TableRow>
                    ) : (
                      cogs.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{c.order_number}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{c.delivery_id || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">{formatMoney(c.total_cost, c.currency_code)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
