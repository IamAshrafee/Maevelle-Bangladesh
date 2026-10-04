'use client';

import { useId, useState } from 'react';

export interface StarRatingProps {
  readonly value: number;
  readonly max?: number;
  readonly size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  readonly interactive?: boolean;
  readonly onRate?: (rating: number) => void;
  readonly name?: string;
  readonly ariaLabel?: string;
  readonly showValueText?: boolean;
  readonly className?: string;
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

const SIZE_MAP = {
  xs: { size: 12, stroke: 1.5, gap: '0.125rem' },
  sm: { size: 14, stroke: 1.5, gap: '0.15rem' },
  md: { size: 18, stroke: 1.75, gap: '0.2rem' },
  lg: { size: 24, stroke: 2, gap: '0.35rem' },
  xl: { size: 32, stroke: 2, gap: '0.5rem' },
};

export function StarRating({
  value,
  max = 5,
  size = 'md',
  interactive = false,
  onRate,
  name,
  ariaLabel,
  showValueText = false,
  className = '',
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const clipId = useId();
  const config = SIZE_MAP[size];
  const displayRating = interactive && hoverRating !== null ? hoverRating : value;
  const clampedValue = Math.max(0, Math.min(max, displayRating));

  const verbalLabel =
    interactive && displayRating > 0
      ? `${displayRating} - ${RATING_LABELS[displayRating] ?? 'Stars'}`
      : `${value.toFixed(1)} out of ${max} stars`;

  return (
    <div
      className={`star-rating-root ${interactive ? 'star-rating-interactive' : ''} ${className}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={ariaLabel ?? verbalLabel}
    >
      <div
        className="star-rating-stars"
        style={{ display: 'inline-flex', alignItems: 'center', gap: config.gap }}
      >
        {Array.from({ length: max }, (_, index) => {
          const starNumber = index + 1;
          const fillRatio = Math.max(0, Math.min(1, clampedValue - index));

          if (interactive) {
            return (
              <button
                type="button"
                key={starNumber}
                role="radio"
                aria-checked={value === starNumber}
                aria-label={`${starNumber} star${starNumber === 1 ? '' : 's'}: ${RATING_LABELS[starNumber] ?? ''}`}
                className="star-button"
                onMouseEnter={() => setHoverRating(starNumber)}
                onMouseLeave={() => setHoverRating(null)}
                onFocus={() => setHoverRating(starNumber)}
                onBlur={() => setHoverRating(null)}
                onClick={() => onRate?.(starNumber)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: size === 'xl' ? '0.375rem' : '0.25rem',
                  margin: 0,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  minHeight: 'auto',
                }}
              >
                <StarSvg
                  fillPercent={fillRatio >= 1 ? 100 : 0}
                  size={config.size}
                  strokeWidth={config.stroke}
                  active={starNumber <= (hoverRating ?? value)}
                />
              </button>
            );
          }

          // Read-only star (with fractional fill)
          const starFillPct = Math.round(fillRatio * 100);
          return (
            <span
              key={starNumber}
              className="star-icon-wrapper"
              style={{ display: 'inline-flex', lineHeight: 1 }}
            >
              <StarSvg
                fillPercent={starFillPct}
                size={config.size}
                strokeWidth={config.stroke}
                gradientId={`${clipId}-star-${starNumber}`}
              />
            </span>
          );
        })}
      </div>

      {showValueText ? (
        <span
          className="star-rating-text"
          style={{
            marginLeft: '0.5rem',
            fontSize: size === 'sm' ? '0.8rem' : size === 'lg' ? '1rem' : '0.9rem',
            fontWeight: 600,
            color: 'var(--ink)',
          }}
        >
          {interactive && hoverRating !== null
            ? RATING_LABELS[hoverRating]
            : interactive && value > 0
              ? RATING_LABELS[value]
              : `${Number(value).toFixed(1)}`}
        </span>
      ) : null}

      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}

function StarSvg({
  fillPercent,
  size,
  strokeWidth,
  active = false,
  gradientId,
}: {
  readonly fillPercent: number;
  readonly size: number;
  readonly strokeWidth: number;
  readonly active?: boolean;
  readonly gradientId?: string;
}) {
  const isFractional = fillPercent > 0 && fillPercent < 100;
  const isFull = fillPercent >= 100;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={isFractional && gradientId ? `url(#${gradientId})` : isFull || active ? '#eab308' : 'none'}
      stroke={isFull || active || fillPercent > 0 ? '#ca8a04' : '#a8a29e'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', transition: 'transform 0.12s ease' }}
    >
      {isFractional && gradientId ? (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset={`${fillPercent}%`} stopColor="#eab308" />
            <stop offset={`${fillPercent}%`} stopColor="transparent" />
          </linearGradient>
        </defs>
      ) : null}
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
