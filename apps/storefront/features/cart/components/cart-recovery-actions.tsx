'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cartStore } from '../browser-runtime';
import { useCartObservation } from '../use-cart-observation';
import type { CartSnapshot } from '../types';

export function CartRecoveryActions({
  state,
  acting,
  act,
}: {
  state: CartSnapshot;
  acting: boolean;
  act(task: () => Promise<unknown>): Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState<'reset' | 'stop' | null>(null);
  const pending = Boolean(state.pending) && !['pending', 'resetting'].includes(state.sync);
  const canReset =
    state.owner === 'guest' &&
    state.mode === 'expired' &&
    !state.pending &&
    state.sync !== 'resetting';
  const retryAt = state.issue?.retryAt ?? 0;
  useCartObservation(state.owner, 'RECOVERY', pending || canReset);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(0, Math.min(2147483647, retryAt - Date.now())),
    );
    return () => clearTimeout(timer);
  }, [retryAt]);
  const waiting = acting || clock < retryAt;
  return (
    <>
      {pending ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button
            disabled={waiting || state.issue?.recovery === 'review'}
            onClick={() => void act(() => cartStore.retryPending())}
          >
            Retry same action
          </Button>
          <Button variant="outline" disabled={acting} onClick={() => setConfirmation('stop')}>
            Stop recovery and review
          </Button>
        </div>
      ) : null}
      {canReset ? (
        <Button
          className="mt-3"
          variant="outline"
          disabled={waiting}
          onClick={() => setConfirmation('reset')}
        >
          Start a new bag on this browser
        </Button>
      ) : null}
      {state.sync === 'resetting' ? (
        <p className="mt-3">Waiting for earlier requests and checking this browser’s session…</p>
      ) : null}
      <ConfirmDialog
        open={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={
          confirmation === 'stop'
            ? 'Stop recovering this action?'
            : 'Start a new bag on this browser?'
        }
        confirmLabel={
          confirmation === 'stop' ? 'Stop recovery' : 'Forget this browser’s bag session'
        }
        fallbackFocusId="cart-feedback"
        onConfirm={() =>
          act(async () => {
            if (confirmation === 'stop') cartStore.stopRetrying();
            else await cartStore.forgetSession();
          })
        }
      >
        {confirmation === 'stop' ? (
          <p>
            The earlier action may already be saved. Stopping recovery does not undo it. Review the
            bag before repeating an action; a new action could apply the change again.
          </p>
        ) : (
          <p>
            This forgets this browser’s access to its bags. Stored bags are not deleted, and
            previously inaccessible contents may not return. Close other shopping tabs first. A new
            bag is created only when you next choose an item.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}
