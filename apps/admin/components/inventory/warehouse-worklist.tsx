'use client';

import * as React from 'react';
import { Worklist, WorklistToolbar, useWorklist, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Package, Truck, ArrowDownToLine, AlertTriangle } from 'lucide-react';

interface WarehouseLocationDto {
  id: string;
  code: string;
  name: string;
  locationType: string;
  capabilities: readonly string[];
  status: string;
}

export function WarehouseWorklist({ locations }: { locations: readonly WarehouseLocationDto[] }) {
  return (
    <Worklist>
      <WarehouseWorklistContent locations={locations} />
    </Worklist>
  );
}

function WarehouseWorklistContent({ locations }: { locations: readonly WarehouseLocationDto[] }) {
  const { searchQuery, sort, setSort } = useWorklist();

  const filteredLocations = React.useMemo(() => {
    return locations.filter(loc => {
      if (searchQuery && !`${loc.name} ${loc.code} ${loc.locationType}`.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      if (!sort) return 0;
      let cmp = 0;
      if (sort.column === 'name') cmp = a.name.localeCompare(b.name);
      else if (sort.column === 'code') cmp = a.code.localeCompare(b.code);
      else if (sort.column === 'type') cmp = a.locationType.localeCompare(b.locationType);
      
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [locations, searchQuery, sort]);

  return (
    <div className="flex flex-col gap-4">
      <WorklistToolbar searchPlaceholder="Search location name or code..." />

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer" onClick={() => setSort('name')}>Name</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort('code')}>Code</TableHead>
              <TableHead className="cursor-pointer" onClick={() => setSort('type')}>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Capabilities</TableHead>
              <TableHead className="text-right">Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLocations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No operational locations found.
                </TableCell>
              </TableRow>
            ) : (
              filteredLocations.map((location) => (
                <TableRow key={location.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <TableCell className="font-medium">{location.name}</TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">{location.code}</TableCell>
                  <TableCell>{location.locationType.replace(/_/g, ' ')}</TableCell>
                  <TableCell>
                    <Badge variant={location.status === 'ACTIVE' ? 'success' as any : 'secondary'}>
                      {location.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {location.capabilities.map(c => (
                        <Badge key={c} variant="outline" className="text-[10px] uppercase">{c.replace(/_/g, ' ')}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-3 text-muted-foreground">
                      {location.capabilities.includes('STOCK_HOLDING') && (
                        <div className="flex items-center gap-1" title="Stock Summary Active">
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      {location.capabilities.includes('TRANSFER_RECEIVE') && (
                        <div className="flex items-center gap-1" title="Open Transfers Supported">
                          <Truck className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex items-center gap-1" title="Inbound Receipts Active">
                        <ArrowDownToLine className="w-4 h-4" />
                      </div>
                      <div className="flex items-center gap-1 text-warning" title="No immediate warnings">
                        <AlertTriangle className="w-4 h-4 opacity-20" />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
