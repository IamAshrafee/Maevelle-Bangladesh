'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cartStore } from '../browser-runtime';
import { useCartSnapshot } from '../use-cart';
import { cartIsBusy } from '../types';

export function CartClearAction() {
  const [open, setOpen] = useState(false);
  const state = useCartSnapshot();
  return (
    <>
      <Button
        variant="outline"
        disabled={cartIsBusy(state) || Boolean(state.pending)}
        onClick={() => setOpen(true)}
      >
        Clear bag
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Clear your bag?"
        confirmLabel="Clear items and coupons"
        fallbackFocusId="cart-feedback"
        onConfirm={() => cartStore.clearCart()}
      >
        <p>
          All items and selected coupons will be removed together. This cannot be undone here. You
          can add items again at their current price and availability.
        </p>
      </ConfirmDialog>
    </>
  );
}
