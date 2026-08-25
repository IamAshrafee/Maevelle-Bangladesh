'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Banknote, FileCheck, ArrowRightLeft, Landmark, Network, TrendingUp } from 'lucide-react';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
import { Input } from '@/components/ui/input';

export function FinanceWorkspace({ 
  accounts, 
  expenses, 
  ledger, 
  reconciliations,
  reload 
}: { 
  accounts: any[], 
  expenses: any[], 
  ledger: any[], 
  reconciliations: any[],
  reload: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState('overview');

  const formatMoney = (amount: string, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount));
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(dateString));
  };

  const calculatePnL = () => {
    // Mock logic based on ledger data
    let revenue = 0;
    let cogs = 0;
    let shipping = 0;
    let gateway = 0;
    let expensesTotal = 0;

    ledger.forEach(entry => {
      const amt = Number(entry.amount_delta);
      if (entry.transaction_type === 'REVENUE') revenue += amt;
      if (entry.transaction_type === 'COGS') cogs += amt;
      if (entry.transaction_type === 'SHIPPING_COLLECTED') shipping += amt;
      if (entry.transaction_type === 'GATEWAY_FEE') gateway += amt;
    });

    expenses.forEach(exp => {
      expensesTotal += Number(exp.amount);
    });

    return {
      revenue,
      cogs,
      shipping,
      gateway,
      expenses: expensesTotal,
      net: revenue + shipping - cogs - gateway - expensesTotal
    };
  };

  const pnl = calculatePnL();

  return (
    <div className="flex flex-col gap-6 h-full">
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="overview" className="gap-2"><Landmark className="w-4 h-4" /> Overview & Accounts</TabsTrigger>
          <TabsTrigger value="pnl" className="gap-2"><TrendingUp className="w-4 h-4" /> Real-time P&L</TabsTrigger>
          <TabsTrigger value="ledger" className="gap-2"><Network className="w-4 h-4" /> Ledger & Double Entry</TabsTrigger>
          <TabsTrigger value="transfers" className="gap-2"><ArrowRightLeft className="w-4 h-4" /> Transfers & Payouts</TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2"><FileCheck className="w-4 h-4" /> Bank Reconciliation</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto pb-8">
          
          <TabsContent value="overview" className="mt-0 space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {accounts.map(acc => (
                <Card key={acc.id} className="border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex justify-between">
                      {acc.name}
                      <Badge variant={acc.account_type === 'BANK' ? 'default' : 'secondary'}>{acc.account_type}</Badge>
                    </CardTitle>
                    <CardDescription className="font-mono text-xs">{acc.account_number}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-mono tracking-tight mt-2">
                      {formatMoney(acc.ledger_balance, acc.currency_code)}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Chart of Accounts Tree</CardTitle>
                <CardDescription>Hierarchical view of asset and liability tracking.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex items-center gap-2"><div className="w-2 h-2 bg-primary rounded-full"></div> Assets</div>
                  <div className="pl-6 text-muted-foreground">└─ Current Assets</div>
                  {accounts.filter(a => ['BANK', 'CASH', 'MOBILE_WALLET'].includes(a.account_type)).map(acc => (
                    <div key={acc.id} className="pl-12 flex justify-between items-center py-1 border-b border-dashed">
                      <span>{acc.account_number} - {acc.name}</span>
                      <span className="font-bold">{formatMoney(acc.ledger_balance, acc.currency_code)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 mt-4"><div className="w-2 h-2 bg-destructive rounded-full"></div> Liabilities</div>
                  <div className="pl-6 text-muted-foreground">└─ Payables</div>
                  {expenses.map(exp => (
                    <div key={exp.id} className="pl-12 flex justify-between items-center py-1 border-b border-dashed">
                      <span>{exp.expense_number} - {exp.description}</span>
                      <span className="text-destructive font-bold">{formatMoney(exp.outstanding, exp.currency_code)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pnl" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss (Real-time)</CardTitle>
                <CardDescription>Derived dynamically from the immutable financial ledger.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-w-2xl mx-auto space-y-4 font-mono">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Product Revenue</span>
                    <span className="font-bold">{formatMoney(String(pnl.revenue), 'BDT')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Shipping Collected</span>
                    <span className="font-bold text-primary">+{formatMoney(String(pnl.shipping), 'BDT')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Cost of Goods Sold (COGS)</span>
                    <span className="font-bold text-destructive">-{formatMoney(String(pnl.cogs), 'BDT')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Payment Gateway Fees</span>
                    <span className="font-bold text-destructive">-{formatMoney(String(pnl.gateway), 'BDT')}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Operational Expenses</span>
                    <span className="font-bold text-destructive">-{formatMoney(String(pnl.expenses), 'BDT')}</span>
                  </div>
                  <div className="flex justify-between py-4 border-b-2 border-primary text-xl bg-muted/20 px-4 rounded-md">
                    <span className="font-bold">Net Profit</span>
                    <span className={pnl.net >= 0 ? 'text-success font-bold' : 'text-destructive font-bold'}>
                      {formatMoney(String(pnl.net), 'BDT')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ledger" className="mt-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Immutable General Ledger</CardTitle>
                <CardDescription>Chronological sequence of all financial movements.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Reference / Order</TableHead>
                      <TableHead className="text-right">Movement</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</TableCell>
                        <TableCell className="font-medium text-sm">{entry.account_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{entry.transaction_type}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{entry.description}</TableCell>
                        <TableCell className={`text-right font-mono font-medium ${Number(entry.amount_delta) > 0 ? 'text-success' : 'text-destructive'}`}>
                          {Number(entry.amount_delta) > 0 ? '+' : ''}{formatMoney(entry.amount_delta, entry.currency_code)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {ledger.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No ledger entries.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfers" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Internal & External Transfers (Payouts)</CardTitle>
                <CardDescription>Move funds between internal accounts or record external payouts to suppliers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                <div className="bg-muted/10 p-6 rounded-lg border flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="font-medium flex items-center gap-2"><ArrowRightLeft className="w-4 h-4"/> Record Transfer</h3>
                    <p className="text-sm text-muted-foreground">Transfers move cash without affecting the P&L.</p>
                  </div>
                  <Button onClick={() => toast.info('Transfer initiated')}>New Transfer</Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.filter(e => e.transaction_type === 'INTERNAL_TRANSFER' || e.transaction_type === 'PAYOUT').map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(entry.created_at)}</TableCell>
                        <TableCell className="text-sm">{entry.description} (via {entry.account_name})</TableCell>
                        <TableCell className="text-right font-mono font-medium">{formatMoney(entry.amount_delta, entry.currency_code)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Bank Reconciliation</CardTitle>
                <CardDescription>Compare actual bank statements against system ledger to detect discrepancies.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[1fr_300px] gap-8">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Ledger Balance</TableHead>
                        <TableHead className="text-right">Observed Balance</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reconciliations.map(rec => (
                        <TableRow key={rec.id}>
                          <TableCell className="text-xs text-muted-foreground">{formatDate(rec.created_at)}</TableCell>
                          <TableCell className="font-medium text-sm">{rec.account_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatMoney(rec.ledger_balance, 'BDT')}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatMoney(rec.observed_balance, 'BDT')}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            <Badge variant={Number(rec.difference_amount) === 0 ? 'success' : 'destructive' as any}>
                              {formatMoney(rec.difference_amount, 'BDT')}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {reconciliations.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No reconciliations performed.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>

                  <div className="bg-muted/10 p-6 rounded-lg border space-y-4">
                    <h3 className="font-medium">New Reconciliation</h3>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm">Account</label>
                        <select className="w-full p-2 border rounded text-sm bg-card">
                          {accounts.filter(a => a.account_type === 'BANK').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm">Observed Bank Balance</label>
                        <Input type="number" placeholder="0.00" />
                      </div>
                      <Button className="w-full">Run Reconciliation</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
