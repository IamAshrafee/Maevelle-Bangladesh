'use client';

import {
  Boxes,
  CircleDollarSign,
  TriangleAlert,
  Wrench,
  Archive,
  CheckCircle2,
} from 'lucide-react';
import type { AssetStatusDto, AssetSummaryDto } from '@maevelle/contracts';
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import { formatAssetMoney } from '@/lib/assets/format';
import { cn } from '@/lib/utils';

interface AssetStatsProps {
  summary: AssetSummaryDto | undefined;
  activeStatus: AssetStatusDto | 'ALL';
  onSelectStatus: (status: AssetStatusDto | 'ALL') => void;
}

export function AssetStats({ summary, activeStatus, onSelectStatus }: AssetStatsProps) {
  const cards = [
    {
      id: 'ALL' as const,
      label: 'All Assets',
      value: summary?.total ?? '—',
      Icon: Boxes,
      description: 'Total tracked durable items',
    },
    {
      id: 'ACTIVE' as const,
      label: 'Active',
      value: summary?.active ?? '—',
      Icon: CheckCircle2,
      description: 'Currently deployed in service',
    },
    {
      id: 'IN_STORAGE' as const,
      label: 'In Storage',
      value: summary?.inStorage ?? '—',
      Icon: Archive,
      description: 'Stored property awaiting use',
    },
    {
      id: 'UNDER_REPAIR' as const,
      label: 'Under Repair',
      value: summary?.underRepair ?? '—',
      Icon: Wrench,
      description: 'Active maintenance or repair',
      highlight: (summary?.underRepair ?? 0) > 0,
    },
    {
      id: 'DAMAGED' as const,
      label: 'Needs Attention',
      value: summary?.attention ?? '—',
      Icon: TriangleAlert,
      description: 'Damaged or needs service',
      highlight: (summary?.attention ?? 0) > 0,
    },
    {
      id: 'COST' as const,
      label: 'Acquisition Cost',
      value: summary ? formatAssetMoney(summary.totalAcquisitionCost, summary.currencyCode) : '—',
      Icon: CircleDollarSign,
      description: 'Historical cost, not book value',
      interactive: false,
    },
  ];

  return (
    <Stats aria-label="Asset summary" className="grid-cols-2 lg:grid-cols-6">
      {cards.map(({ id, label, value, Icon, description, highlight, interactive = true }) => {
        const isSelected = activeStatus === id;
        return (
          <StatsCard
            key={label}
            onClick={interactive ? () => onSelectStatus(id as AssetStatusDto | 'ALL') : undefined}
            className={cn(
              interactive &&
                'cursor-pointer transition-all hover:border-primary/50 hover:shadow-xs',
              isSelected && 'border-primary ring-2 ring-primary/20 bg-primary/5',
              highlight && !isSelected && 'border-amber-500/40 bg-amber-500/5',
            )}
          >
            <div className="flex items-center justify-between">
              <Icon
                className={cn(
                  'size-4 text-muted-foreground',
                  isSelected && 'text-primary font-bold',
                  highlight && !isSelected && 'text-amber-600 dark:text-amber-400',
                )}
              />
              {interactive ? (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isSelected ? 'Filtered' : 'Filter'}
                </span>
              ) : null}
            </div>
            <StatsTitle>{label}</StatsTitle>
            <StatsValue className={cn(highlight && 'text-amber-700 dark:text-amber-400')}>
              {String(value)}
            </StatsValue>
            <StatsDescription>{description}</StatsDescription>
          </StatsCard>
        );
      })}
    </Stats>
  );
}
