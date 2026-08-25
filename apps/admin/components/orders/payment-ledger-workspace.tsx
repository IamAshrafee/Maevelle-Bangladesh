'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const format = (d: any, f: string) => String(d);
import { RefreshCw, CheckCircle, Clock, XCircle, Undo2, Ban } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface PaymentLedgerWorkspaceProps {
  orderId: string;
  expectedAmount: string;
}

export function PaymentLedgerWorkspace({ orderId, expectedAmount }: PaymentLedgerWorkspaceProps) {
  const [ledger, setLedger] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLedger = async () => {
    setIsLoading(true);
    try {
      const response = await request<{ data: any }>(`/api/admin/orders/${orderId}/ledger`);
      setLedger(response.data);
    } catch (error) {
      toast.error('Failed to load payment ledger');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, [orderId]);

  const money = (amount: string) => {
    return new Intl.NumberFormat('en-BD', {
      style: 'currency',
      currency: 'BDT',
    }).format(Number(amount));
  };

  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Payment Ledger</CardTitle>
          <CardDescription>Loading financial records...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const { payments = [], refunds = [], attempts = [] } = ledger || {};

  return (
    <Card className="mt-8 border-t">
      <CardHeader>
        <CardTitle>Payment Ledger</CardTitle>
        <CardDescription>Detailed financial history for this order.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Payment Attempts */}
        {attempts.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Payment Attempts & Authorizations</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attempts.map((attempt: any) => (
                    <TableRow key={attempt.id}>
                      <TableCell>{format(new Date(attempt.submittedAt), 'PP p')}</TableCell>
                      <TableCell className="font-mono text-xs">{attempt.customerReference}</TableCell>
                      <TableCell>{attempt.methodName}</TableCell>
                      <TableCell>
                        <Badge variant={attempt.status === 'VERIFIED' ? 'default' : attempt.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                          {attempt.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Confirmed Payments */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Captured Funds</h4>
          {payments.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4 border rounded-md bg-muted/50 text-center">
              No funds have been captured yet.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Gateway ID</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((payment: any) => (
                    <TableRow key={payment.id}>
                      <TableCell>{format(new Date(payment.confirmedAt), 'PP p')}</TableCell>
                      <TableCell className="font-mono text-xs">{payment.paymentNumber}</TableCell>
                      <TableCell>{payment.method}</TableCell>
                      <TableCell className="text-right">{money(payment.amount)}</TableCell>
                      <TableCell className="text-right font-medium">{money(payment.net)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Refunds */}
        {refunds.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Refunds</h4>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Refund ID</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refunds.map((refund: any) => (
                    <TableRow key={refund.id}>
                      <TableCell>{format(new Date(refund.requestedAt), 'PP p')}</TableCell>
                      <TableCell className="font-mono text-xs">{refund.refundNumber}</TableCell>
                      <TableCell>{refund.reasonCode}</TableCell>
                      <TableCell>
                        <Badge variant={refund.status === 'COMPLETED' ? 'default' : 'secondary'}>
                          {refund.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-destructive">-{money(refund.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
