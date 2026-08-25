'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, Database, ShieldCheck, Download, Upload, Image as ImageIcon, MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

export function SettingsWorkspace({
  profile,
  reload
}: {
  profile: any,
  reload: () => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState('general');

  const team = [
    { id: 'u1', name: 'Admin User', email: 'admin@maevelle.com', role: 'Super Admin', status: 'Active' },
    { id: 'u2', name: 'Logistics Lead', email: 'warehouse@maevelle.com', role: 'Warehouse Staff', status: 'Active' },
    { id: 'u3', name: 'Finance Mgr', email: 'finance@maevelle.com', role: 'Finance Only', status: 'Pending' },
  ];

  const auditLogs = [
    { id: 'a1', user: 'Admin User', action: 'Changed Tax Rate to 15%', time: '2 hours ago' },
    { id: 'a2', user: 'Logistics Lead', action: 'Approved Landed Cost Worksheet', time: '5 hours ago' },
    { id: 'a3', user: 'System', action: 'Auto-sync ERP failed', time: '1 day ago' },
  ];

  const reports = [
    { id: 'r1', name: 'Q2_Inventory_Valuation.csv', size: '2.4 MB', date: 'Oct 10, 2023' },
    { id: 'r2', name: 'Full_Product_Catalog_Export.csv', size: '14.1 MB', date: 'Oct 9, 2023' },
  ];

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success('Settings updated successfully.');
  };

  const handleInvite = () => {
    toast.success('Invitation sent.');
  };

  const handleUpload = () => {
    toast.info('Initializing CSV Mapper...');
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full flex flex-col">
        <TabsList className="mb-4 w-fit">
          <TabsTrigger value="general" className="gap-2"><Settings className="w-4 h-4" /> General & Brand</TabsTrigger>
          <TabsTrigger value="team" className="gap-2"><Users className="w-4 h-4" /> Team & Access (RBAC)</TabsTrigger>
          <TabsTrigger value="data" className="gap-2"><Database className="w-4 h-4" /> Import / Export</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto pb-8">
          
          <TabsContent value="general" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Brand Assets</CardTitle>
                  <CardDescription>Visual identity for customer-facing surfaces.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 border rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">Primary Logo</h4>
                      <p className="text-xs text-muted-foreground mb-2">SVG or transparent PNG</p>
                      <Button variant="outline" size="sm">Replace</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border rounded bg-muted flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">Favicon</h4>
                      <p className="text-xs text-muted-foreground mb-2">32x32 ICO or PNG</p>
                      <Button variant="outline" size="sm">Replace</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Localization & Tax</CardTitle>
                  <CardDescription>Regional overrides and financial defaults.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveGeneral} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Base Currency</label>
                      <select className="w-full p-2 text-sm border rounded bg-card" defaultValue={profile?.default_currency || 'BDT'}>
                        <option value="BDT">BDT (৳)</option>
                        <option value="USD">USD ($)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Default Tax Rate (%)</label>
                      <Input type="number" defaultValue="15" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Timezone</label>
                      <select className="w-full p-2 text-sm border rounded bg-card" defaultValue={profile?.timezone || 'Asia/Dhaka'}>
                        <option value="Asia/Dhaka">Asia/Dhaka</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>
                    <Button type="submit">Save Localization</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="team" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Team Members</CardTitle>
                      <CardDescription>Manage organization access and custom roles.</CardDescription>
                    </div>
                    <Button onClick={handleInvite}><Users className="w-4 h-4 mr-2" /> Invite User</Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.map(t => (
                          <TableRow key={t.id}>
                            <TableCell>
                              <div className="font-medium">{t.name}</div>
                              <div className="text-xs text-muted-foreground">{t.email}</div>
                            </TableCell>
                            <TableCell><Badge variant="outline">{t.role}</Badge></TableCell>
                            <TableCell>
                              <Badge variant={t.status === 'Active' ? 'success' : 'warning' as any}>{t.status}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="ghost">Edit</Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Custom Roles (RBAC)</CardTitle>
                    <CardDescription>Define granular permissions.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border rounded p-4 space-y-2">
                        <h4 className="font-medium">Warehouse Staff</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">Only sees Inventory, Receiving, Stocktakes. Cannot see Finance or Analytics.</p>
                      </div>
                      <div className="border rounded p-4 space-y-2">
                        <h4 className="font-medium">Finance Only</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2">Full access to Ledgers, Reconciliations, and Costing. Read-only Orders.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Audit Logs</CardTitle>
                    <CardDescription>Sensitive action tracking</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {auditLogs.map(log => (
                        <div key={log.id} className="border-b pb-3 last:border-0 last:pb-0">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{log.user}</span>
                            <span className="text-xs text-muted-foreground">{log.time}</span>
                          </div>
                          <p className="text-xs mt-1 text-muted-foreground">{log.action}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="data" className="mt-0 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Upload className="w-4 h-4" /> CSV Bulk Import</CardTitle>
                  <CardDescription>Import Products, Inventory, or Historical Orders.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/10 hover:bg-muted/30 transition-colors cursor-pointer" onClick={handleUpload}>
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
                    <h3 className="font-medium mb-1">Drag and drop CSV file here</h3>
                    <p className="text-xs text-muted-foreground">The Mapping UI will open for unknown columns.</p>
                  </div>
                  <div className="flex justify-between text-sm items-center p-3 border rounded bg-primary/5">
                    <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Supported schemas</span>
                    <span className="text-muted-foreground">Products, Stock, Orders</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Download className="w-4 h-4" /> Download Center</CardTitle>
                  <CardDescription>Access generated bulk exports and reports.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1"><Download className="w-4 h-4 mr-2" /> Request Catalog Export</Button>
                      <Button variant="secondary" className="flex-1"><Download className="w-4 h-4 mr-2" /> Request Order Export</Button>
                    </div>
                    <div className="mt-6 pt-4 border-t space-y-3">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Recent Files</h4>
                      {reports.map(r => (
                        <div key={r.id} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded transition-colors group cursor-pointer">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="bg-primary/10 p-2 rounded text-primary"><Download className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{r.name}</p>
                              <p className="text-xs text-muted-foreground">{r.size} · {r.date}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
