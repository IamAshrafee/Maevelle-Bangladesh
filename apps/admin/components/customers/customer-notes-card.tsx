'use client';

import { FileText, Lock, Plus } from 'lucide-react';
import type { CustomerNoteDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { AddNoteDialog } from './add-note-dialog';

interface CustomerNotesCardProps {
  readonly customerId: string;
  readonly notes: readonly CustomerNoteDto[];
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerNotesCard({
  customerId,
  notes,
  isReadOnly = false,
  onUpdated,
}: CustomerNotesCardProps) {
  const canManage = useAdminCapability('customers.manage') && !isReadOnly;

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Internal Notes">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Internal Operator Notes</h2>
        </div>
        {canManage && <AddNoteDialog customerId={customerId} onAdded={onUpdated} />}
      </div>

      <div className="p-6">
        <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300 mb-4">
          <Lock className="size-3 shrink-0" aria-hidden="true" />
          <span>Internal notes are private to authorized staff and are strictly never shown to customers.</span>
        </div>

        {notes.length === 0 ? (
          <p className="text-center py-6 text-xs text-muted-foreground italic">
            No internal notes recorded for this customer.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border bg-muted/20 p-3.5 text-xs text-foreground space-y-1.5"
              >
                <p className="whitespace-pre-wrap leading-relaxed">{note.body}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                  <span>
                    {new Intl.DateTimeFormat('en-BD', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(note.createdAt))}
                  </span>
                  {note.authorActorId && (
                    <span className="font-mono text-[10px]">Actor: {note.authorActorId.slice(0, 8)}...</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
