'use client';

import { Tag } from 'lucide-react';
import type { CustomerTagDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { useAdminCapability } from '@/components/admin-capabilities';
import { ManageTagsDialog } from './manage-tags-dialog';

interface CustomerTagsCardProps {
  readonly customerId: string;
  readonly tags: readonly CustomerTagDto[];
  readonly isReadOnly?: boolean;
  readonly onUpdated: () => void;
}

export function CustomerTagsCard({
  customerId,
  tags,
  isReadOnly = false,
  onUpdated,
}: CustomerTagsCardProps) {
  const canManage = useAdminCapability('customers.manage') && !isReadOnly;

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Customer Tags">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Tags & Attributes</h2>
        </div>
        {canManage && (
          <ManageTagsDialog customerId={customerId} assignedTags={tags} onUpdated={onUpdated} />
        )}
      </div>

      <div className="p-6">
        {tags.length === 0 ? (
          <p className="text-center py-4 text-xs text-muted-foreground italic">
            No tags assigned to this customer.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                variant="secondary"
                className="text-xs px-2.5 py-1 font-medium"
                style={
                  tag.color
                    ? {
                        backgroundColor: tag.color,
                        color: '#fff',
                        borderColor: 'transparent',
                      }
                    : undefined
                }
              >
                {tag.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
