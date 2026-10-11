'use client';

import React from 'react';
import type { UnitConditionDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';

const CONDITION_LABELS: Record<UnitConditionDto, string> = {
  GRADE_A: 'Grade A (Flawless)',
  GRADE_B: 'Grade B (Minor Defect)',
  REPAIR_REQUIRED: 'Repair Required',
  DAMAGED_UNSELLABLE: 'Damaged / Unsellable',
};

const CONDITION_TONES: Record<
  UnitConditionDto,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  GRADE_A: 'success',
  GRADE_B: 'info',
  REPAIR_REQUIRED: 'warning',
  DAMAGED_UNSELLABLE: 'danger',
};

export function UnitConditionBadge({
  condition,
  short = false,
  className,
}: {
  readonly condition: UnitConditionDto;
  readonly short?: boolean;
  readonly className?: string;
}) {
  const tone = CONDITION_TONES[condition] ?? 'neutral';
  const label = short
    ? condition === 'GRADE_A'
      ? 'Grade A'
      : condition === 'GRADE_B'
        ? 'Grade B'
        : condition === 'REPAIR_REQUIRED'
          ? 'Repair Req.'
          : 'Damaged'
    : CONDITION_LABELS[condition] ?? condition;

  return (
    <StatusBadge
      status={label}
      tone={tone}
      className={cn('font-medium', className)}
    />
  );
}
