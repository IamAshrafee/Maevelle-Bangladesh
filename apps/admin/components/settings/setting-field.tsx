'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingSourceBadge } from './setting-status-badge';
import { cn } from '@/lib/utils';
import type { SettingSource } from '@maevelle/contracts';

interface SettingFieldProps {
  readonly id?: string;
  readonly label: string;
  readonly description?: string;
  readonly consequenceHint?: string;
  readonly source?: SettingSource;
  readonly error?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}

export function SettingField({
  id,
  label,
  description,
  consequenceHint,
  source,
  error,
  required,
  children,
  className,
}: SettingFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {source && <SettingSourceBadge source={source} />}
      </div>

      {description && <p className="text-xs text-muted-foreground leading-normal">{description}</p>}

      <div className="pt-0.5">{children}</div>

      {consequenceHint && (
        <p className="text-[11px] text-muted-foreground/85 italic bg-muted/30 px-2 py-1 rounded border border-border/40">
          💡 {consequenceHint}
        </p>
      )}

      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

interface SettingToggleProps {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly consequenceHint?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly source?: SettingSource;
  readonly className?: string;
}

export function SettingToggle({
  id,
  label,
  description,
  consequenceHint,
  checked,
  onCheckedChange,
  disabled = false,
  source,
  className,
}: SettingToggleProps) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-start justify-between gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/10 transition-colors',
        disabled && 'opacity-60 cursor-not-allowed',
        className,
      )}
    >
      <div className="space-y-1 pr-2">
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="text-sm font-medium text-foreground cursor-pointer">
            {label}
          </Label>
          {source && <SettingSourceBadge source={source} />}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        {consequenceHint && (
          <p className="text-[11px] text-muted-foreground/80 italic mt-1">
            Notice: {consequenceHint}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
        <span className="text-xs font-medium text-muted-foreground">
          {checked ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Enabled</span>
          ) : (
            'Disabled'
          )}
        </span>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          aria-label={label}
        />
      </div>
    </div>
  );
}
