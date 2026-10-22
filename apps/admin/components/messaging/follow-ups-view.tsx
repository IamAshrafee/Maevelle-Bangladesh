'use client';

import { CalendarClock, Check, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { FollowUpView } from '@maevelle/contracts/messaging';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/page-shell';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './api';
import { formatDateTime } from './format';
import { useMessaging } from './messaging-provider';

export function FollowUpsView({ onOpenConversation }: { onOpenConversation: () => void }) {
  const messaging = useMessaging();
  const [items, setItems] = useState<readonly FollowUpView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  async function load() {
    setState('loading');
    try {
      setItems(await api.listFollowUps({ status: 'PENDING', mine: true, limit: 200 }));
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function transition(item: FollowUpView, status: 'COMPLETED' | 'CANCELLED') {
    try {
      await api.transitionFollowUp(item.id, item.version, status);
      toast.add({
        title: status === 'COMPLETED' ? 'Follow-up completed' : 'Follow-up cancelled',
        type: 'success',
      });
      await load();
    } catch (error) {
      toast.add({
        title: 'Follow-up was not updated',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    }
  }
  if (state === 'loading') return <LoadingState message="Loading follow-ups…" className="h-full" />;
  if (state === 'error')
    return (
      <ErrorState
        title="Follow-ups unavailable"
        message="The follow-up queue could not be loaded."
        onRetry={() => void load()}
        className="m-4"
      />
    );
  if (!items.length)
    return (
      <EmptyState
        icon={CalendarClock}
        title="You are all caught up"
        description="Pending follow-ups assigned to you will appear here."
        className="m-4"
      />
    );
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className={cn(
              'rounded-xl border border-border bg-card p-4',
              item.isOverdue && 'border-destructive/50',
            )}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">Conversation follow-up</h3>
                  {item.isOverdue ? (
                    <Badge variant="destructive">Overdue</Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                  Due {formatDateTime(item.dueAt)}
                </p>
                {item.note ? <p className="mt-2 text-sm">{item.note}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    messaging.selectConversation(item.conversationId);
                    onOpenConversation();
                  }}
                >
                  <MessageCircle className="size-4" /> Open
                </Button>
                <Button size="sm" onClick={() => void transition(item, 'COMPLETED')}>
                  <Check className="size-4" /> Complete
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void transition(item, 'CANCELLED')}
                  aria-label="Cancel follow-up"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
