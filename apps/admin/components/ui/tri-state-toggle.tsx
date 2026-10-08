'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

export type TriStateValue = boolean | null;

interface TriStateToggleProps {
  readonly value: TriStateValue;
  readonly onValueChange: (value: TriStateValue) => void;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
}

const choices: readonly { value: TriStateValue; label: string; description: string }[] = [
  { value: false, label: 'No', description: 'This does not apply' },
  { value: null, label: 'Unknown', description: 'Not provided' },
  { value: true, label: 'Yes', description: 'This applies' },
];

export function TriStateToggle({
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
}: TriStateToggleProps) {
  const groupName = useId();

  return (
    <div
      aria-label={ariaLabel}
      className="grid h-9 grid-cols-3 rounded-lg border border-border bg-muted p-0.5"
      role="radiogroup"
    >
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <label
            key={choice.label}
            className={cn('min-w-0', disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}
          >
            <input
              type="radio"
              name={groupName}
              checked={selected}
              disabled={disabled}
              aria-label={`${choice.label}: ${choice.description}`}
              className="peer sr-only"
              onChange={() => onValueChange(choice.value)}
            />
            <span
              className={cn(
                'flex h-full items-center justify-center rounded-md px-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-150',
                'peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1',
                selected
                  ? choice.value === null
                    ? 'bg-card text-foreground shadow-2xs'
                    : choice.value
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'bg-secondary text-secondary-foreground shadow-2xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {choice.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
