'use client';

import type { ComponentProps } from 'react';
import Link from 'next/link';
import type { WarehouseLocationDto } from '@maevelle/contracts';
import { ArrowRight, Building2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type TransferRoutingCardProps = {
  sourceLocationId: string;
  destinationLocationId: string;
  sourceLocations: readonly WarehouseLocationDto[];
  destinationLocations: readonly WarehouseLocationDto[];
  loading: boolean;
  sourceError?: string | undefined;
  destinationError?: string | undefined;
  notesError?: string | undefined;
  notesInputProps: ComponentProps<'textarea'>;
  onSourceChange: (value: string | null) => void;
  onDestinationChange: (value: string | null) => void;
};

export function TransferRoutingCard({
  sourceLocationId,
  destinationLocationId,
  sourceLocations,
  destinationLocations,
  loading,
  sourceError,
  destinationError,
  notesError,
  notesInputProps,
  onSourceChange,
  onDestinationChange,
}: TransferRoutingCardProps) {
  const selectedSource = sourceLocations.find((location) => location.id === sourceLocationId);
  const selectedDestination = destinationLocations.find(
    (location) => location.id === destinationLocationId,
  );

  return (
    <Card className="shadow-xs">
      <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
        <CardTitle className="text-base font-semibold">Transfer Routing</CardTitle>
        <CardDescription className="text-xs">
          Select origin and destination depots. Dispatches must originate from a stock-holding
          source.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-4 pt-0 sm:p-5 sm:pt-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="source-location" className="text-xs font-medium">
              Source Location (Origin) <span className="text-destructive">*</span>
            </Label>
            <Select value={sourceLocationId} onValueChange={onSourceChange} disabled={loading}>
              <SelectTrigger id="source-location" className="text-sm">
                <SelectValue placeholder={loading ? 'Loading locations…' : 'Select origin depot'} />
              </SelectTrigger>
              <SelectContent>
                {sourceLocations.map((location) => (
                  <SelectItem
                    key={location.id}
                    value={location.id}
                    label={`${location.name} (${location.code})`}
                    description={`${location.locationType.replace('_', ' ')} · ${location.status}`}
                  >
                    {location.name}{' '}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      ({location.code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sourceError ? (
              <p className="text-[11px] font-medium text-destructive">{sourceError}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination-location" className="text-xs font-medium">
              Destination Location <span className="text-destructive">*</span>
            </Label>
            <Select
              value={destinationLocationId}
              onValueChange={onDestinationChange}
              disabled={loading || !sourceLocationId}
            >
              <SelectTrigger id="destination-location" className="text-sm">
                <SelectValue
                  placeholder={
                    !sourceLocationId
                      ? 'Select source location first'
                      : loading
                        ? 'Loading locations…'
                        : 'Select receiving facility'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {destinationLocations.map((location) => (
                  <SelectItem
                    key={location.id}
                    value={location.id}
                    label={`${location.name} (${location.code})`}
                    description={`${location.locationType.replace('_', ' ')} · ${location.status}`}
                  >
                    {location.name}{' '}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      ({location.code})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinationError ? (
              <p className="text-[11px] font-medium text-destructive">{destinationError}</p>
            ) : null}
          </div>
        </div>

        {selectedSource && selectedDestination ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 font-medium">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span>{selectedSource.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                ({selectedSource.code})
              </span>
            </div>
            <ArrowRight className="mx-1 size-3.5 shrink-0 text-muted-foreground" />
            <div className="flex items-center gap-1.5 font-medium">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span>{selectedDestination.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                ({selectedDestination.code})
              </span>
            </div>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="transfer-notes" className="text-xs font-medium">
            Dispatch Notes & Instructions
          </Label>
          <Textarea
            id="transfer-notes"
            placeholder="Optional carrier instructions, reason for transfer, or consignment reference"
            rows={2}
            className="text-sm"
            {...notesInputProps}
          />
          {notesError ? (
            <p className="text-[11px] font-medium text-destructive">{notesError}</p>
          ) : null}
        </div>

        {sourceLocations.length === 0 && !loading ? (
          <p className="text-xs text-muted-foreground">
            No sending facility is configured. Review{' '}
            <Link href="/inventory/warehouses" className="font-medium text-primary underline">
              Warehouse Locations
            </Link>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
