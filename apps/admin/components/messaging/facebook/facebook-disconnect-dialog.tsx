'use client';

import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { FacebookConnectionView } from '@maevelle/contracts/messaging';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/toast';
import * as api from './facebook-api';

export interface FacebookDisconnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: FacebookConnectionView;
  onDisconnected: () => Promise<void>;
}

export function FacebookDisconnectDialog({
  open,
  onOpenChange,
  connection,
  onDisconnected,
}: FacebookDisconnectDialogProps) {
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleConfirm() {
    setDisconnecting(true);
    try {
      await api.disconnectFacebookConnection(connection.id);
      toast.add({
        title: 'Facebook Page disconnected',
        description: `Successfully disconnected "${connection.pageName}".`,
        type: 'success',
      });
      onOpenChange(false);
      await onDisconnected();
    } catch (err) {
      toast.add({
        title: 'Disconnection failed',
        description: err instanceof Error ? err.message : 'Could not complete disconnection.',
        type: 'error',
      });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 shrink-0" />
            <AlertDialogTitle>Disconnect Facebook Page?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-xs space-y-2.5 pt-1 text-muted-foreground">
            <p>
              Are you sure you want to disconnect <strong>{connection.pageName}</strong> (ID: {connection.pageId})?
            </p>
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5 text-left text-xs">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-primary" />
                What happens when you disconnect:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li>Maevelle will unsubscribe from Facebook Messenger webhooks.</li>
                <li>Encrypted Page tokens stored on the server will be deleted.</li>
                <li>
                  <strong className="text-foreground">Conversation History Preserved:</strong> All existing conversations and messages in your Maevelle unified inbox remain safe.
                </li>
                <li>
                  <strong className="text-foreground">Facebook Safe:</strong> Your Facebook Page, posts, and Meta Business Suite account are <span className="font-semibold text-foreground">NOT deleted</span>.
                </li>
                <li>
                  <strong className="text-foreground">Asset Isolation:</strong> Instagram, WhatsApp, and Meta Ad accounts are completely unaffected.
                </li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-3">
          <AlertDialogCancel disabled={disconnecting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={disconnecting}
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            className="gap-1.5"
          >
            {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Confirm Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
