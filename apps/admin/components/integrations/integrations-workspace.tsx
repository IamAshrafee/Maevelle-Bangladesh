'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Puzzle, ShieldCheck, Webhook, Activity, RefreshCw, Key, Power } from 'lucide-react';

export function IntegrationsWorkspace({
  integrationData
}: {
  integrationData: any
}) {
  const [activeTab, setActiveTab] = useState('connectors');

  const connectors = [
    { id: '1', name: 'Stripe Payments', category: 'Payment Gateway', status: 'HEALTHY', lastSync: '2 mins ago' },
    { id: '2', name: 'SSLCommerz', category: 'Payment Gateway', status: 'HEALTHY', lastSync: '15 mins ago' },
    { id: '3', name: 'Pathao Courier', category: 'Shipping Provider', status: 'DEGRADED', lastSync: '1 hr ago' },
    { id: '4', name: 'NetSuite ERP', category: 'ERP', status: 'HEALTHY', lastSync: '5 mins ago' },
  ];

  return (
    <div className="flex flex-col gap-6 h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="connectors" className="gap-2"><Puzzle className="w-4 h-4" /> Connectors</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="w-4 h-4" /> Webhooks</TabsTrigger>
          <TabsTrigger value="sync" className="gap-2"><Activity className="w-4 h-4" /> Sync Queue</TabsTrigger>
          <TabsTrigger value="health" className="gap-2"><ShieldCheck className="w-4 h-4" /> Health & Logs</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto pb-8">
          
          <TabsContent value="connectors" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Third-Party Connectors</CardTitle>
                <CardDescription>Manage active integrations with external platforms.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Connector</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectors.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'HEALTHY' ? 'success' : 'destructive'}>
                            {c.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{c.lastSync}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="icon" variant="outline" title="Settings"><Key className="w-4 h-4" /></Button>
                            <Button size="icon" variant="outline" title="Disable"><Power className="w-4 h-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="mt-0 space-y-6">
            <div className="flex justify-end">
              <Button><Webhook className="w-4 h-4 mr-2" /> Add Webhook Endpoint</Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Webhook Endpoints</CardTitle>
                <CardDescription>URLs that receive HTTP push notifications for subscribed events.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint URL</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrationData?.webhooks?.map((w: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-sm">{String(w.endpoint_url || w.url || 'https://example.com/hook')}</TableCell>
                        <TableCell><Badge variant="success">Active</Badge></TableCell>
                        <TableCell className="text-xs">{String(w.events || 'order.created, inventory.updated')}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline">Roll Secret</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!integrationData?.webhooks?.length && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No webhooks configured.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sync" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Background Sync Jobs</CardTitle>
                <CardDescription>Monitor queue for asynchronous operations.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job ID</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrationData?.operations?.map((op: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{String(op.id || op.job_id || 'JOB-123')}</TableCell>
                        <TableCell>{String(op.domain || 'ERP_SYNC')}</TableCell>
                        <TableCell><Badge variant="secondary">{String(op.status || 'COMPLETED')}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-xs">{String(op.created_at || new Date().toISOString())}</TableCell>
                      </TableRow>
                    ))}
                    {!integrationData?.operations?.length && (
                      <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No operations in queue.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Provider Health & Exceptions</CardTitle>
                <CardDescription>Diagnostic logs for integration issues.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {integrationData?.exceptions?.map((ex: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{String(ex.provider || 'System')}</TableCell>
                        <TableCell className="text-destructive text-sm">{String(ex.message || 'Connection timeout')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{String(ex.created_at || 'Just now')}</TableCell>
                      </TableRow>
                    ))}
                    {!integrationData?.exceptions?.length && (
                      <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No recent exceptions.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
