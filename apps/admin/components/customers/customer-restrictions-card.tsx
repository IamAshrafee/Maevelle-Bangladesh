'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Ban,
  Clock,
  History,
  ShieldAlert,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import type { CustomerRestrictionDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { CustomerRestrictionBadge } from './customer-restriction-badge';
import { ApplyRestrictionDialog } from './apply-restriction-dialog';
import { LiftRestrictionDialog } from './lift-restriction-dialog';

interface CustomerRestrictionsCardProps {
  readonly customerId: string;
  readonly restrictions: readonly CustomerRestrictionDto[];
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerRestrictionsCard({
  customerId,
  restrictions,
  isReadOnly = false,
  onUpdated,
}: CustomerRestrictionsCardProps) {
  const canRestrict = useAdminCapability('customers.restrict') && !isReadOnly;
  const [showHistory, setShowHistory] = useState(false);
  const [selectedLiftTarget, setSelectedLiftTarget] = useState<CustomerRestrictionDto | null>(null);

  const now = new Date();
  const activeList = restrictions.filter(
    (r) => r.status === 'ACTIVE' && (!r.expiresAt || new Date(r.expiresAt) > now),
  );
  const pastList = restrictions.filter(
    (r) => r.status !== 'ACTIVE' || (r.expiresAt && new Date(r.expiresAt) <= now),
  );

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Commercial Restrictions">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-rose-600" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Commercial Restrictions</h2>
            <p className="text-xs text-muted-foreground">
              Enforced checkout rules (COD block, order review, or total ban).
            </p>
          </div>
        </div>
        {canRestrict && (
          <ApplyRestrictionDialog customerId={customerId} onApplied={onUpdated} />
        )}
      </div>

      <div className="p-6 space-y-4">
        {activeList.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
            <ShieldCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
            <p>
              No active restrictions. Customer has unrestricted online checkout and manual ordering
              privileges.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeList.map((restriction) => (
              <div
                key={restriction.id}
                className="rounded-lg border border-rose-200 bg-rose-50/40 p-4 dark:border-rose-900/50 dark:bg-rose-950/20 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <CustomerRestrictionBadge restrictionType={restriction.restrictionType} />

                  {canRestrict && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 border-rose-300 hover:bg-rose-100 dark:border-rose-800"
                      onClick={() => setSelectedLiftTarget(restriction)}
                    >
                      <Undo2 className="size-3 text-emerald-600" />
                      Lift Restriction
                    </Button>
                  )}
                </div>

                <div className="text-xs space-y-1">
                  <p className="font-medium text-foreground">
                    Reason: <span className="font-normal text-muted-foreground">{restriction.reason}</span>
                  </p>
                  {restriction.notes && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Notes:</span> {restriction.notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground border-t border-rose-200/60 dark:border-rose-900/40 pt-2">
                  <span>
                    Applied on{' '}
                    {new Intl.DateTimeFormat('en-BD', { dateStyle: 'medium' }).format(
                      new Date(restriction.createdAt),
                    )}
                  </span>
                  <span>
                    {restriction.expiresAt ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                        <Clock className="size-3" />
                        Expires{' '}
                        {new Intl.DateTimeFormat('en-BD', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(restriction.expiresAt))}
                      </span>
                    ) : (
                      'Indefinite'
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Historical Restrictions Toggle */}
        {pastList.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              <History className="size-3.5" aria-hidden="true" />
              {showHistory
                ? 'Hide Past Restrictions'
                : `View Past Restrictions (${pastList.length})`}
            </button>

            {showHistory && (
              <div className="space-y-2 pt-1">
                {pastList.map((restriction) => (
                  <div
                    key={restriction.id}
                    className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground capitalize">
                        {restriction.restrictionType.toLowerCase().replaceAll('_', ' ')}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {restriction.status}
                      </Badge>
                    </div>
                    <p>Reason: {restriction.reason}</p>
                    {restriction.liftReason && (
                      <p className="text-emerald-700 dark:text-emerald-400">
                        Lifted Reason: {restriction.liftReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedLiftTarget && (
        <LiftRestrictionDialog
          customerId={customerId}
          restriction={selectedLiftTarget}
          open={Boolean(selectedLiftTarget)}
          onOpenChange={(open) => !open && setSelectedLiftTarget(null)}
          onLifted={onUpdated}
        />
      )}
    </section>
  );
}
