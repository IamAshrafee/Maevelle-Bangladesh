'use client';

import * as React from 'react';
import { Worklist, WorklistToolbar, useWorklist, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileCheck, Anchor, ArrowRight } from 'lucide-react';

interface Receipt {
  id: string;
  receiptNumber: string;
  shipmentId: string;
  status: string;
  lines: readonly { condition: string; quantity: string }[];
}

export function ReceiptWorklist({ receipts }: { receipts: readonly Receipt[] }) {
  return (
    <Worklist>
      <ReceiptWorklistContent receipts={receipts} />
    </Worklist>
  );
}

function ReceiptWorklistContent({ receipts }: { receipts: readonly Receipt[] }) {
  const { searchQuery } = useWorklist();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filteredReceipts = React.useMemo(() => {
    return receipts.filter(r => {
      if (searchQuery && !`${r.receiptNumber} ${r.shipmentId}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [receipts, searchQuery]);

  const selected = receipts.find(r => r.id === selectedId);

  return (
    <div className="flex h-full min-h-[500px] gap-6">
      <div className="flex-1 flex flex-col gap-4">
        <WorklistToolbar searchPlaceholder="Search receipt or shipment..." />

        <div className="rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt Number</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Shipment Reference</TableHead>
                <TableHead className="text-right">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No posted receipts found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReceipts.map((receipt) => (
                  <TableRow 
                    key={receipt.id} 
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === receipt.id ? 'bg-muted/50' : ''}`}
                    onClick={() => setSelectedId(receipt.id)}
                  >
                    <TableCell className="font-medium flex items-center gap-2">
                      <FileCheck className="w-4 h-4 text-muted-foreground" />
                      {receipt.receiptNumber}
                    </TableCell>
                    <TableCell>
                      <Badge variant={receipt.status === 'POSTED' ? 'success' as any : 'secondary'}>
                        {receipt.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {receipt.shipmentId}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {receipt.lines.length}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selected && (
        <Card className="w-[400px] animate-in fade-in slide-in-from-right-4 shrink-0 self-start">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-primary" /> {selected.receiptNumber}
            </CardTitle>
            <div className="text-sm text-muted-foreground">Immutable inventory ledger entry</div>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={selected.status === 'POSTED' ? 'success' as any : 'secondary'}>{selected.status}</Badge>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">Shipment Ref</span>
                <span className="font-mono text-xs flex items-center gap-1"><Anchor className="w-3 h-3"/> {selected.shipmentId}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground">Received Lines</h4>
              <div className="border rounded-md divide-y">
                {selected.lines.map((line, idx) => (
                  <div key={idx} className="p-3 flex justify-between items-center bg-card">
                    <Badge variant={line.condition === 'SELLABLE' ? 'default' : 'secondary'}>{line.condition}</Badge>
                    <span className="font-medium">+{line.quantity}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-muted/10 p-4 rounded-lg border text-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Landed Cost</span>
                <span className="font-medium text-primary cursor-pointer hover:underline">View Allocation <ArrowRight className="inline w-3 h-3" /></span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
