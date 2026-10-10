'use client';

import * as React from 'react';
import {
  Calendar,
  Clock,
  Download,
  Filter,
  Globe,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type AnalyticsGranularityDto,
  type DateRangePreset,
  type DateRangeSelection,
  getDateRangeFromPreset,
} from '@/lib/analytics/types';
import { cn } from '@/lib/utils';

interface AnalyticsFilterToolbarProps {
  readonly selection: DateRangeSelection;
  readonly onChange: (next: DateRangeSelection) => void;
  readonly onExportClick?: () => void;
  readonly exportDisabled?: boolean;
  readonly showGranularity?: boolean;
  readonly comparisonText?: string;
  readonly timezone?: string;
  readonly className?: string;
}

const PRESET_LABELS: Record<DateRangePreset, string> = {
  TODAY: 'Today',
  YESTERDAY: 'Yesterday',
  LAST_7_DAYS: 'Last 7 days',
  LAST_30_DAYS: 'Last 30 days',
  THIS_MONTH: 'This month',
  LAST_MONTH: 'Last month',
  THIS_YEAR: 'This year',
  CUSTOM: 'Custom range',
};

export function AnalyticsFilterToolbar({
  selection,
  onChange,
  onExportClick,
  exportDisabled = false,
  showGranularity = true,
  comparisonText,
  timezone = 'Asia/Dhaka',
  className,
}: AnalyticsFilterToolbarProps) {
  const [customOpen, setCustomOpen] = React.useState(selection.preset === 'CUSTOM');

  const handlePresetChange = (preset: DateRangePreset) => {
    if (preset === 'CUSTOM') {
      setCustomOpen(true);
      onChange({
        ...selection,
        preset: 'CUSTOM',
      });
      return;
    }
    setCustomOpen(false);
    const { from, to } = getDateRangeFromPreset(preset);
    onChange({
      ...selection,
      preset,
      from,
      to,
    });
  };

  const handleCustomDateChange = (field: 'from' | 'to', value: string) => {
    onChange({
      ...selection,
      preset: 'CUSTOM',
      [field]: value,
    });
  };

  const handleGranularityChange = (granularity: AnalyticsGranularityDto) => {
    onChange({
      ...selection,
      granularity,
    });
  };

  const handleReset = () => {
    const { from, to } = getDateRangeFromPreset('LAST_30_DAYS');
    setCustomOpen(false);
    onChange({
      preset: 'LAST_30_DAYS',
      from,
      to,
      granularity: 'DAY',
      currency: 'BDT',
    });
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border/80 bg-card p-3 sm:p-4 text-card-foreground shadow-2xs',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Presets & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Selector */}
          <div className="w-36 sm:w-44">
            <NativeSelect
              value={selection.preset}
              onChange={(e) => handlePresetChange(e.target.value as DateRangePreset)}
              className="h-9 text-xs sm:text-sm font-medium bg-background"
            >
              {(Object.keys(PRESET_LABELS) as DateRangePreset[]).map((preset) => (
                <option key={preset} value={preset}>
                  {PRESET_LABELS[preset]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Granularity Selector */}
          {showGranularity ? (
            <div className="w-28 sm:w-32">
              <NativeSelect
                value={selection.granularity}
                onChange={(e) =>
                  handleGranularityChange(e.target.value as AnalyticsGranularityDto)
                }
                className="h-9 text-xs sm:text-sm bg-background"
              >
                <option value="DAY">Daily</option>
                <option value="WEEK">Weekly</option>
                <option value="MONTH">Monthly</option>
              </NativeSelect>
            </div>
          ) : null}

          {/* Quick Preset Buttons (visible on md+) */}
          <div className="hidden xl:flex items-center gap-1 border-l border-border/70 pl-2">
            {(['LAST_7_DAYS', 'LAST_30_DAYS', 'THIS_MONTH'] as DateRangePreset[]).map((p) => (
              <Button
                key={p}
                type="button"
                variant={selection.preset === p ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-8 px-2.5 text-xs',
                  selection.preset === p && 'font-semibold text-primary shadow-2xs',
                )}
                onClick={() => handlePresetChange(p)}
              >
                {PRESET_LABELS[p]}
              </Button>
            ))}
          </div>
        </div>

        {/* Right: Timezone & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timezone pill */}
          <Tooltip>
            <TooltipTrigger render={<div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground select-none cursor-help" />}>
              <Globe className="size-3.5 text-primary" />
              <span className="font-mono font-medium">{timezone}</span>
              <span className="text-[10px] text-muted-foreground/80">(UTC+6)</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p className="font-semibold text-foreground">Operational Timezone</p>
              <p className="mt-0.5 text-muted-foreground">
                All daily and weekly buckets align to Bangladesh Standard Time (UTC+6). Transactions
                around midnight are counted by their local business date.
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Export Report Action */}
          {onExportClick ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exportDisabled}
              onClick={onExportClick}
              className="h-9 gap-1.5 text-xs"
            >
              <Download className="size-3.5 text-muted-foreground" />
              <span>Export CSV</span>
            </Button>
          ) : null}

          {/* Reset Filters */}
          {selection.preset !== 'LAST_30_DAYS' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Reset date range to Last 30 Days"
            >
              <RotateCcw className="size-3.5 mr-1" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Custom Date Inputs (when preset === 'CUSTOM') */}
      {customOpen || selection.preset === 'CUSTOM' ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/70 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="size-3.5 text-primary" />
            <span className="font-medium">Custom period:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="custom-from">
              From:
            </label>
            <Input
              id="custom-from"
              type="date"
              value={selection.from}
              onChange={(e) => handleCustomDateChange('from', e.target.value)}
              className="h-8 w-36 text-xs bg-background tabular-nums font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="custom-to">
              To:
            </label>
            <Input
              id="custom-to"
              type="date"
              value={selection.to}
              onChange={(e) => handleCustomDateChange('to', e.target.value)}
              className="h-8 w-36 text-xs bg-background tabular-nums font-mono"
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            Inclusive dates evaluated as <code className="font-mono text-foreground font-semibold">[{selection.from} to {selection.to}]</code>
          </span>
        </div>
      ) : null}

      {/* Comparison Context Banner */}
      {comparisonText ? (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 truncate">
            <Clock className="size-3.5 text-muted-foreground/70 shrink-0" />
            <span className="truncate">
              Comparing against prior equal-length period:{' '}
              <strong className="text-foreground font-mono font-medium">{comparisonText}</strong>
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground/80 shrink-0 hidden md:inline">
            Equal duration baseline
          </span>
        </div>
      ) : null}
    </div>
  );
}
