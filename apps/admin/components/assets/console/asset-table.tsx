'use client';

import Link from 'next/link';
import {
  Banknote,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  ShieldAlert,
  UserRound,
  Wrench,
} from 'lucide-react';
import type { AssetListItemDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAssetDate, formatAssetMoney } from '@/lib/assets/format';
import { AssetConditionBadge, AssetStatusBadge } from '../asset-status-badge';
import { isTerminalAsset } from '../types';

interface AssetTableProps {
  items: readonly AssetListItemDto[];
  canManage: boolean;
  canLifecycle: boolean;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  onPageChange: (newPage: number) => void;
  onQuickAction?: (
    action: 'assign' | 'move' | 'maintenance' | 'sale' | 'dispose',
    item: AssetListItemDto,
  ) => void;
}

export function AssetTable({
  items,
  canManage,
  canLifecycle,
  pagination,
  onPageChange,
  onQuickAction,
}: AssetTableProps) {
  return (
    <div className="grid gap-4">
      {/* Desktop Table View */}
      <Card className="hidden md:flex">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%]">Asset</TableHead>
                <TableHead className="w-[18%]">Status & Condition</TableHead>
                <TableHead className="w-[22%]">Location / Custodian</TableHead>
                <TableHead className="w-[15%]">Acquisition</TableHead>
                <TableHead className="w-[10%] text-right">Cost</TableHead>
                <TableHead className="w-[5%] text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const terminal = isTerminalAsset(item.status);
                return (
                  <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell>
                      <div className="grid gap-0.5">
                        <Link
                          className="font-semibold text-primary hover:underline flex items-center gap-1.5"
                          href={`/assets/${item.id}`}
                        >
                          <span className="font-mono text-xs font-bold text-foreground bg-muted/70 px-1.5 py-0.5 rounded">
                            {item.assetCode}
                          </span>
                          <span>{item.name}</span>
                        </Link>
                        <p className="text-xs text-muted-foreground truncate max-w-sm">
                          {[
                            item.categoryName,
                            item.brand,
                            item.model,
                            item.serialNumber && `S/N: ${item.serialNumber}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'No secondary details'}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        <AssetStatusBadge status={item.status} />
                        <AssetConditionBadge condition={item.condition} />
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        <div className="flex items-center gap-1.5 font-medium">
                          <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {item.locationName ?? item.customLocation ?? 'Unlocated'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <UserRound className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">
                            {item.custodianName
                              ? `Assigned to ${item.custodianName}`
                              : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-xs">
                        <p className="font-medium text-foreground">
                          {formatAssetDate(item.acquisitionDate)}
                        </p>
                        <p className="text-muted-foreground">Historical record</p>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="font-mono font-medium text-sm">
                        {item.acquisitionCost
                          ? formatAssetMoney(item.acquisitionCost, item.currencyCode)
                          : '—'}
                      </span>
                    </TableCell>

                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-sm" aria-label="Asset options">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Asset Actions</DropdownMenuLabel>
                          <DropdownMenuItem render={<Link href={`/assets/${item.id}`} />}>
                            <ExternalLink className="size-4 mr-2" />
                            View details
                          </DropdownMenuItem>

                          {canManage && !terminal ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onQuickAction?.('assign', item)}>
                                <UserRound className="size-4 mr-2" />
                                Change custodian
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onQuickAction?.('move', item)}>
                                <MapPin className="size-4 mr-2" />
                                Move location
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onQuickAction?.('maintenance', item)}
                              >
                                <Wrench className="size-4 mr-2" />
                                Record service
                              </DropdownMenuItem>
                            </>
                          ) : null}

                          {canLifecycle && !terminal ? (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onQuickAction?.('sale', item)}>
                                <Banknote className="size-4 mr-2" />
                                Sell asset
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onQuickAction?.('dispose', item)}
                                className="text-destructive focus:text-destructive"
                              >
                                <ShieldAlert className="size-4 mr-2" />
                                Dispose asset
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Card List View */}
      <div className="grid gap-3 md:hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/assets/${item.id}`}
            className="rounded-xl border bg-card p-4 hover:border-primary/50 transition-all flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-xs font-bold text-foreground bg-muted px-1.5 py-0.5 rounded mr-1.5">
                  {item.assetCode}
                </span>
                <strong className="text-base text-foreground">{item.name}</strong>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {item.categoryName ?? 'Uncategorized'}
                  {item.brand ? ` · ${item.brand}` : ''}
                </p>
              </div>
              <AssetStatusBadge status={item.status} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-y py-2.5 bg-muted/20 -mx-4 px-4">
              <div>
                <span className="text-muted-foreground">Location</span>
                <p className="font-medium text-foreground truncate">
                  {item.locationName ?? item.customLocation ?? 'Unlocated'}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Custodian</span>
                <p className="font-medium text-foreground truncate">
                  {item.custodianName ?? 'Unassigned'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <div>
                <span className="text-muted-foreground">Acquired: </span>
                <span className="font-medium">{formatAssetDate(item.acquisitionDate)}</span>
              </div>
              <div className="font-mono font-semibold text-sm">
                {item.acquisitionCost
                  ? formatAssetMoney(item.acquisitionCost, item.currencyCode)
                  : '—'}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2">
        <p className="text-xs text-muted-foreground">
          Showing{' '}
          <strong className="text-foreground">
            {pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}
          </strong>{' '}
          to{' '}
          <strong className="text-foreground">
            {Math.min(pagination.page * pagination.pageSize, pagination.totalItems)}
          </strong>{' '}
          of <strong className="text-foreground">{pagination.totalItems}</strong> assets
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground px-2">
            Page {pagination.page} of {Math.max(1, pagination.totalPages)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => onPageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
