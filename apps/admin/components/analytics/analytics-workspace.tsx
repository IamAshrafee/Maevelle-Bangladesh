'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, TrendingUp, Users, ShoppingCart, Activity, Package, DollarSign, Filter, ArrowRight } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

export function AnalyticsWorkspace({ 
  overview, 
  snapshots, 
  dashboards,
  rebuild 
}: { 
  overview: any, 
  snapshots: any[], 
  dashboards: any,
  rebuild: () => Promise<void>
}) {

  // Mock data for visual blocks that aren't provided directly by the backend yet
  const todayRevenue = '12,450 BDT';
  const todayOrders = '42';
  const activeCarts = '18';
  const liveVisitors = '104';
  
  const funnel = {
    sessions: 4500,
    productViews: 2100,
    addToCart: 450,
    checkoutStarted: 320,
    purchased: 180
  };

  const handleRebuild = async () => {
    toast.promise(rebuild(), {
      loading: 'Rebuilding projections from authoritative facts...',
      success: 'Projections rebuilt successfully.',
      error: 'Rebuild failed.'
    });
  };

  const formatMoney = (val: string, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(val));
  };

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="w-4 h-4 text-primary" />
          <span>Last sync: {overview?.refreshedAt ? new Date(overview.refreshedAt).toLocaleString() : 'Not yet rebuilt'}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="w-4 h-4" /> Date Range: Today
          </Button>
          <Button size="sm" onClick={handleRebuild} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Rebuild Core Facts
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayRevenue}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-success inline-flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> +14.2%</span> from yesterday
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-success inline-flex items-center"><TrendingUp className="w-3 h-3 mr-1" /> +8.1%</span> from yesterday
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Carts</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCarts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              4 high-value carts over 5,000 BDT
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Live Visitors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{liveVisitors}</div>
            <p className="text-xs text-muted-foreground mt-1 text-primary">
              <span className="relative flex h-2 w-2 inline-block mr-1 top-[1px]">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Real-time active sessions
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales Volume (All Time)</CardTitle>
            <CardDescription>Aggregated from core financial and inventory facts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Gross Sales</TableHead>
                  <TableHead className="text-right">Discounts</TableHead>
                  <TableHead className="text-right">Net Sales</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview?.metrics?.map((m: any, i: number) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium"><Badge variant="outline">{m.currencyCode}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(m.grossSales, m.currencyCode)}</TableCell>
                    <TableCell className="text-right font-mono text-destructive">-{formatMoney(m.discounts, m.currencyCode)}</TableCell>
                    <TableCell className="text-right font-mono font-bold text-success">{formatMoney(m.netSales, m.currencyCode)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.orderLines}</TableCell>
                  </TableRow>
                ))}
                {!overview?.metrics?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No sales data projected.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversion Funnel</CardTitle>
            <CardDescription>Trailing 30 days performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Store Sessions</span>
                  <span className="text-muted-foreground">{funnel.sessions.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: '100%' }}></div>
                </div>
              </div>
              <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground transform rotate-90" /></div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Product Views</span>
                  <span className="text-muted-foreground">{funnel.productViews.toLocaleString()} ({(funnel.productViews/funnel.sessions*100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(funnel.productViews/funnel.sessions*100)}%` }}></div>
                </div>
              </div>
              <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground transform rotate-90" /></div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Added to Cart</span>
                  <span className="text-muted-foreground">{funnel.addToCart.toLocaleString()} ({(funnel.addToCart/funnel.productViews*100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(funnel.addToCart/funnel.sessions*100)}%` }}></div>
                </div>
              </div>
              <div className="flex justify-center"><ArrowRight className="w-4 h-4 text-muted-foreground transform rotate-90" /></div>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Purchased</span>
                  <span className="text-muted-foreground font-bold text-success">{funnel.purchased.toLocaleString()} ({(funnel.purchased/funnel.addToCart*100).toFixed(1)}%)</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-success" style={{ width: `${(funnel.purchased/funnel.sessions*100)}%` }}></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {dashboards?.products && (
        <Card>
          <CardHeader>
            <CardTitle>Top Products by Volume</CardTitle>
            <CardDescription>Projected from ledger reporting facts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {Object.keys(dashboards.products[0] || {}).slice(0, 5).map(col => (
                    <TableHead key={col}>{col.replace(/_/g, ' ')}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboards.products.map((row: any, i: number) => (
                  <TableRow key={i}>
                    {Object.keys(dashboards.products[0] || {}).slice(0, 5).map(col => (
                      <TableCell key={col}>{String(row[col])}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
