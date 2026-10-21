'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryBalanceDto, PaginatedDto } from '@maevelle/contracts';

import { Combobox } from '@/components/ui/combobox';
import { inventoryRequest } from '@/lib/inventory/api';

type TransferStockPickerProps = {
  sourceLocationId: string;
  value: string;
  excludedVariantIds: ReadonlySet<string>;
  onValueChange: (item: InventoryBalanceDto | null) => void;
  onItemResolved?: (item: InventoryBalanceDto) => void;
  onResolutionError?: (message: string) => void;
  invalid?: boolean;
};

const itemLabel = (item: InventoryBalanceDto) => `${item.productTitle} — ${item.sku}`;

export function TransferStockPicker({
  sourceLocationId,
  value,
  excludedVariantIds,
  onValueChange,
  onItemResolved,
  onResolutionError,
  invalid = false,
}: TransferStockPickerProps) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly InventoryBalanceDto[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryBalanceDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onItemResolvedRef = useRef(onItemResolved);
  const onResolutionErrorRef = useRef(onResolutionError);

  useEffect(() => {
    onItemResolvedRef.current = onItemResolved;
    onResolutionErrorRef.current = onResolutionError;
  }, [onItemResolved, onResolutionError]);

  useEffect(() => {
    if (!value) {
      setSelectedItem(null);
      return;
    }
    if (selectedItem?.variantId === value) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      locationId: sourceLocationId,
      variantId: value,
      availability: 'IN_STOCK',
      limit: '1',
    });
    inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
      `/inventory/stock?${params.toString()}`,
      { signal: controller.signal },
    )
      .then((response) => {
        const item = response.data.items[0] ?? null;
        setSelectedItem(item);
        if (item) {
          onItemResolvedRef.current?.(item);
        } else {
          const message = 'This item no longer has transferable stock at the source location.';
          setError(message);
          onResolutionErrorRef.current?.(message);
        }
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'The selected stock item could not be resolved.',
          );
        }
      });

    return () => controller.abort();
  }, [selectedItem?.variantId, sourceLocationId, value]);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams({
        locationId: sourceLocationId,
        availability: 'IN_STOCK',
        page: '1',
        limit: '25',
      });
      if (query.trim()) params.set('search', query.trim());

      setLoading(true);
      setError(null);
      inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
        `/inventory/stock?${params.toString()}`,
        { signal: controller.signal },
      )
        .then((response) => setItems(response.data.items))
        .catch((requestError) => {
          if (!controller.signal.aborted) {
            setItems([]);
            setError(
              requestError instanceof Error
                ? requestError.message
                : 'Transferable stock could not be loaded.',
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, sourceLocationId]);

  const options = useMemo(() => {
    if (!selectedItem || items.some((item) => item.variantId === selectedItem.variantId)) {
      return items;
    }
    return [selectedItem, ...items];
  }, [items, selectedItem]);

  return (
    <div className="space-y-1">
      <Combobox<InventoryBalanceDto>
        value={selectedItem}
        items={options}
        filter={null}
        itemToStringLabel={itemLabel}
        itemToStringValue={(item) => item.variantId}
        isItemEqualToValue={(item, selected) => item.variantId === selected.variantId}
        onInputValueChange={setQuery}
        onValueChange={(item) => {
          setSelectedItem(item);
          onValueChange(item);
        }}
        status={invalid || Boolean(error) ? 'error' : 'default'}
      >
        <Combobox.InputGroup>
          <Combobox.Input
            placeholder="Search product title or SKU"
            aria-label="Search transferable stock"
            aria-invalid={invalid || Boolean(error)}
          />
          <Combobox.Clear />
          <Combobox.Trigger />
        </Combobox.InputGroup>
        <Combobox.Content>
          <Combobox.Status>
            {loading ? 'Searching transferable stock…' : error ? `Could not load stock: ${error}` : null}
          </Combobox.Status>
          <Combobox.Empty>
            {query.trim()
              ? 'No transferable stock matches this search.'
              : 'No transferable stock is available at this location.'}
          </Combobox.Empty>
          <Combobox.List>
            {options.map((item, index) => {
              const alreadyUsed =
                excludedVariantIds.has(item.variantId) && item.variantId !== value;
              return (
                <Combobox.Item
                  key={`${item.inventoryItemId}-${item.condition}`}
                  value={item}
                  index={index}
                  disabled={alreadyUsed}
                  description={`${item.availableToSell} available${alreadyUsed ? ' · Already in transfer' : ''}`}
                >
                  <span>{item.productTitle}</span>
                  <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
                    {item.sku}
                  </span>
                </Combobox.Item>
              );
            })}
          </Combobox.List>
        </Combobox.Content>
      </Combobox>
    </div>
  );
}
