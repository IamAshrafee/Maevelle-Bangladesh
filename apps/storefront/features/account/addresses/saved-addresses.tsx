'use client';
import { useEffect, useRef, useState } from 'react';
import type { ShopperAddressDto, ShopperAddressInput } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AddressEditor } from './address-editor';

export interface AddressActions {
  select(id: string, revision: string): Promise<unknown>;
  address(value: ShopperAddressInput, id?: string, revision?: string): Promise<unknown>;
  remove(id: string, revision: string): Promise<unknown>;
  more(): Promise<unknown>;
}
export function SavedAddresses({
  items,
  nextOffset,
  busy,
  actions,
  onSelected,
  successKey,
  selectedId,
}: {
  items: readonly ShopperAddressDto[];
  nextOffset: number | null;
  busy: boolean;
  actions: AddressActions;
  onSelected(): void;
  successKey: string | null;
  selectedId: string | null;
}) {
  const [editing, setEditing] = useState<ShopperAddressDto | null | undefined>(),
    [removing, setRemoving] = useState<ShopperAddressDto | null>(null),
    [message, setMessage] = useState(''),
    [expanded, setExpanded] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (successKey) {
      setEditing(undefined);
      setRemoving(null);
      requestAnimationFrame(() => heading.current?.focus());
    }
  }, [successKey]);
  async function act(run: () => Promise<unknown>) {
    setMessage('');
    try {
      await run();
    } catch {
      setMessage('This address action could not be confirmed. Review the delivery message below.');
    }
  }
  function closeEditor() {
    setEditing(undefined);
    requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <section className="min-w-0 space-y-4" aria-labelledby="saved-addresses-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          id="saved-addresses-heading"
          tabIndex={-1}
          ref={heading}
          className="font-serif text-xl font-semibold"
        >
          Your saved addresses
        </h3>
        <Button
          variant="outline"
          disabled={busy || editing !== undefined}
          onClick={() => setEditing(null)}
        >
          Add an address
        </Button>
      </div>
      {!items.length && (
        <p className="text-sm text-on-surface-variant">
          No saved addresses yet. You can use a one-time address below without saving it to your
          account.
        </p>
      )}
      {message && (
        <p role="alert" className="text-sm text-error">
          {message}
        </p>
      )}
      {items.length > 2 && (
        <Button variant="ghost" disabled={busy} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Show fewer addresses' : 'View more saved addresses'}
        </Button>
      )}
      <div
        className="max-h-[28rem] space-y-3 overflow-y-auto overscroll-contain"
        role="region"
        aria-label="Saved address choices"
        tabIndex={expanded ? 0 : -1}
      >
        {(expanded ? items : items.slice(0, 2)).map((address) => (
          <article
            key={address.id}
            className="min-w-0 rounded-xl border border-border-subtle bg-surface-container-lowest p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="break-words font-semibold">{address.label || address.recipientName}</p>
              {address.isDefault && (
                <span className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary">
                  Default
                </span>
              )}
            </div>
            {address.id === selectedId && (
              <p className="mt-2 text-xs font-semibold text-primary">Selected for this checkout</p>
            )}
            <p className="mt-2 break-words text-sm">
              {address.recipientName}
              {address.mobile ? ` · ${address.mobile}` : ''}
            </p>
            <p className="mt-1 break-words text-sm text-on-surface-variant">
              {address.addressLine1}
              {address.addressLine2 ? `, ${address.addressLine2}` : ''}
            </p>
            {(!address.mobile || !address.geographyNodeId || address.countryCode !== 'BD') && (
              <p className="mt-2 text-sm text-error">
                Edit this address and choose a supported Bangladesh delivery area before using it.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={
                  busy ||
                  editing !== undefined ||
                  !address.mobile ||
                  !address.geographyNodeId ||
                  address.countryCode !== 'BD'
                }
                onClick={() =>
                  void act(async () => {
                    await actions.select(address.id, address.revision);
                    onSelected();
                  })
                }
              >
                Use this address
              </Button>
              <Button
                variant="ghost"
                disabled={busy || editing !== undefined}
                onClick={() => setEditing(address)}
              >
                Edit
              </Button>
              {!address.isDefault && (
                <Button
                  variant="ghost"
                  disabled={
                    busy ||
                    editing !== undefined ||
                    !address.mobile ||
                    !address.geographyNodeId ||
                    address.countryCode !== 'BD'
                  }
                  onClick={() =>
                    void act(() =>
                      actions.address(
                        {
                          ...address,
                          mobile: address.mobile!,
                          geographyNodeId: address.geographyNodeId!,
                          isDefault: true,
                        },
                        address.id,
                        address.revision,
                      ),
                    )
                  }
                >
                  Make default
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy || editing !== undefined}
                onClick={() => setRemoving(address)}
              >
                Remove
              </Button>
            </div>
          </article>
        ))}
      </div>
      {expanded && nextOffset !== null && (
        <Button variant="outline" disabled={busy} onClick={() => void act(actions.more)}>
          More saved addresses
        </Button>
      )}
      {editing !== undefined && (
        <AddressEditor
          key={editing?.id ?? 'new'}
          address={editing}
          busy={busy}
          onClose={closeEditor}
          onSave={(value) => actions.address(value, editing?.id, editing?.revision)}
        />
      )}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove saved address?"
        confirmLabel="Remove address"
        onClose={() => setRemoving(null)}
        fallbackFocusId="saved-addresses-heading"
        confirmDisabled={busy}
        onConfirm={async () => {
          if (removing) await actions.remove(removing.id, removing.revision);
          setRemoving(null);
        }}
      >
        The saved address will be removed from your account. A destination already selected for this
        checkout will stay available for your explicit review.
      </ConfirmDialog>
    </section>
  );
}
