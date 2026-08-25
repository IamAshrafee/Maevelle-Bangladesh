'use client';

import * as React from 'react';
import { Worklist, WorklistToolbar, useWorklist, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Plus, XCircle, Building2 } from 'lucide-react';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface Supplier {
  id: string;
  code: string;
  name: string;
  status: string;
  version: number;
}

export function SupplierWorklist({ suppliers, reload }: { suppliers: readonly Supplier[], reload: () => Promise<void> }) {
  return (
    <Worklist>
      <SupplierWorklistContent suppliers={suppliers} reload={reload} />
    </Worklist>
  );
}

function SupplierWorklistContent({ suppliers, reload }: { suppliers: readonly Supplier[], reload: () => Promise<void> }) {
  const { searchQuery, sort, setSort } = useWorklist();
  const [isCreating, setIsCreating] = React.useState(false);
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filteredSuppliers = React.useMemo(() => {
    return suppliers.filter(s => {
      if (searchQuery && !`${s.name} ${s.code}`.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (!sort) return 0;
      let cmp = 0;
      if (sort.column === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort.column === 'code') cmp = a.code.localeCompare(b.code);
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [suppliers, searchQuery, sort]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !name) { toast.error('Code and Name are required'); return; }
    try {
      await request('/api/admin/suppliers', {
        method: 'POST',
        body: JSON.stringify({ code, name }),
      });
      toast.success('Supplier created.');
      setCode('');
      setName('');
      setIsCreating(false);
      await reload();
    } catch {
      toast.error('Supplier could not be created.');
    }
  };

  const selected = suppliers.find(s => s.id === selectedId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <WorklistToolbar searchPlaceholder="Search supplier name or code..." />
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Supplier
        </Button>
      </div>

      <div className="flex h-full min-h-[500px] gap-6">
        <div className="flex-1 rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => setSort('name')}>Supplier Name</TableHead>
                <TableHead className="cursor-pointer" onClick={() => setSort('code')}>Code</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No suppliers found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredSuppliers.map((supplier) => (
                  <TableRow 
                    key={supplier.id} 
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === supplier.id ? 'bg-muted/50' : ''}`}
                    onClick={() => { setSelectedId(supplier.id); setIsCreating(false); }}
                  >
                    <TableCell className="font-medium flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground" />
                      {supplier.name}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{supplier.code}</TableCell>
                    <TableCell>
                      <Badge variant={supplier.status === 'ACTIVE' ? 'success' as any : 'secondary'}>
                        {supplier.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {isCreating && (
          <Card className="w-[400px] animate-in fade-in slide-in-from-right-4 shrink-0 self-start">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>New Supplier</CardTitle>
                <CardDescription>Register a new vendor.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)}>
                <XCircle className="h-5 w-5" />
              </Button>
            </CardHeader>
            <form onSubmit={handleCreate}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Supplier Code</label>
                  <Input placeholder="e.g. VEN-001" value={code} onChange={e => setCode(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <Input placeholder="Company Name" value={name} onChange={e => setName(e.target.value)} required />
                </div>
              </CardContent>
              <CardFooter className="border-t pt-4 bg-muted/10">
                <Button type="submit" className="w-full">Create Supplier</Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {selected && !isCreating && (
          <Card className="w-[400px] animate-in fade-in slide-in-from-right-4 shrink-0 self-start">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-xl">{selected.name}</CardTitle>
                <div className="flex gap-2 items-center">
                  <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
                  <Badge variant={selected.status === 'ACTIVE' ? 'success' as any : 'secondary'}>{selected.status}</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
                <XCircle className="h-5 w-5" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-6 pt-4">
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Supplier ID</span>
                  <span className="font-mono text-xs">{selected.id}</span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span className="text-muted-foreground">Status</span>
                  <span>{selected.status}</span>
                </div>
              </div>
              
              <div className="bg-muted/30 p-4 rounded-md border border-dashed flex flex-col items-center justify-center text-center space-y-2">
                <p className="text-sm text-muted-foreground">Detailed supplier analytics and active purchases context would render here.</p>
                <Button variant="outline" size="sm" onClick={() => toast.info('Purchases filter would apply here')}>View Active Purchases</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
