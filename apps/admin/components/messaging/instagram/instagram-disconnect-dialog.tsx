'use client';

import { AlertTriangle, Instagram, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { InstagramConnectionView } from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import * as api from './instagram-api';

interface InstagramDisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: InstagramConnectionView;
  onDisconnected: () => Promise<void>;
}

export function InstagramDisconnectDialog({
  open,
  onOpenChange,
  connection,
  onDisconnected,
}: InstagramDisconnectDialogProps) {
  const [busy, setBusy] = useState(false);

  async function disconnect() {
    setBusy(true);
    try {
      await api.disconnectInstagramConnection(connection.id);
      toast.add({
        title: 'Instagram Account Disconnected',
        description:
          'Credentials were removed. Maevelle conversation history and customer links were preserved.',
        type: 'success',
      });
      onOpenChange(false);
      await onDisconnected();
    } catch (cause) {
      toast.add({
        title: 'Instagram Account Was Not Disconnected',
        description:
          cause instanceof Error ? cause.message : 'Try again after checking connection health.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="size-5 text-primary" aria-hidden="true" /> Disconnect Instagram
            Direct?
          </DialogTitle>
          <DialogDescription>
            Disconnect {connection.username ? `@${connection.username}` : connection.displayName}{' '}
            from Maevelle.
          </DialogDescription>
        </DialogHeader>
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
          <AlertTitle>This Stops New Instagram Messaging</AlertTitle>
          <AlertDescription>
            Maevelle attempts to unsubscribe this account, destroys its stored credential, and stops
            pending sends. Existing canonical transcripts, assignments, notes, tags, and customer
            links remain intact. Native Instagram conversations are not deleted.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep Connected
          </Button>
          <Button variant="destructive" onClick={() => void disconnect()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Disconnect Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
