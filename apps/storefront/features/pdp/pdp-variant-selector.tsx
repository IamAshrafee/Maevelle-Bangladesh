'use client';

import { CheckIcon } from '@/components/ui/icons';

interface OptionValue {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly colorHex?: string;
  readonly isPrimary?: boolean;
}

interface ProductOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly isVisual: boolean;
  readonly values: readonly OptionValue[];
}

export interface PdpVariantSelectorProps {
  readonly options: readonly ProductOption[];
  readonly selected: Record<string, string>;
  readonly onChoose: (axisId: string, valueId: string) => void;
  readonly valuePossible: (axisId: string, valueId: string) => boolean;
  readonly onFittingGuide?: () => void;
}

export function PdpVariantSelector({
  options,
  selected,
  onChoose,
  valuePossible,
  onFittingGuide,
}: PdpVariantSelectorProps) {
  if (options.length === 0) return null;

  return (
    <section className="px-4 pt-5 flex flex-col gap-5">
      {options.map((axis) => {
        const isColor = axis.values.some((v) => v.colorHex);
        const isSize =
          axis.code.toLowerCase().includes('size') || axis.name.toLowerCase().includes('size');
        const selectedValue = axis.values.find((v) => v.id === selected[axis.id]);

        return (
          <fieldset key={axis.id} className="border-0 p-0 m-0 flex flex-col gap-2.5">
            {/* Legend row */}
            <div className="flex items-center justify-between">
              <legend className="text-[13px] font-semibold text-[#1e1b19] p-0 float-none">
                {axis.name}
                {isColor && selectedValue ? (
                  <>
                    {': '}
                    <span className="text-[#9e2a4b]">{selectedValue.label}</span>
                  </>
                ) : null}
              </legend>
              {isSize && onFittingGuide ? (
                <button
                  type="button"
                  id="pdp-size-guide-trigger"
                  onClick={onFittingGuide}
                  className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#9e2a4b] hover:text-[#7e0e35] underline underline-offset-2 min-h-0 border-0 bg-transparent p-0 cursor-pointer transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6z" />
                    <path d="m14.5 12.5 2-2" />
                    <path d="m11.5 9.5 2-2" />
                    <path d="m8.5 6.5 2-2" />
                  </svg>
                  <span>Size &amp; Fit Guide</span>
                </button>
              ) : isColor ? (
                <span className="text-[11px] text-[#8a7174]">Pure Silk Velvet</span>
              ) : null}
            </div>

            {/* Color swatches */}
            {isColor ? (
              <div className="flex items-center gap-3">
                {axis.values.map((value) => {
                  const active = selected[axis.id] === value.id;
                  const possible = valuePossible(axis.id, value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      title={value.label}
                      aria-label={value.label}
                      aria-pressed={active}
                      disabled={!possible}
                      onClick={() => onChoose(axis.id, value.id)}
                      className={[
                        'relative w-10 h-10 rounded-full p-0.5 flex items-center justify-center transition-all duration-150',
                        active
                          ? 'ring-2 ring-[#9e2a4b] ring-offset-2 ring-offset-[#fff8f5]'
                          : 'ring-2 ring-[#ddbfc3] hover:scale-105',
                        !possible ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <span
                        className="w-full h-full rounded-full flex items-center justify-center"
                        style={{ backgroundColor: value.colorHex ?? '#cccccc' }}
                      >
                        {active && <CheckIcon size={14} className="text-white drop-shadow" />}
                      </span>
                      {!possible && (
                        <span className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                          <span className="absolute inset-0 border-t border-[#8a7174] rotate-45 origin-center" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Size/style chips */
              <div className="grid grid-cols-3 gap-2">
                {axis.values.map((value) => {
                  const active = selected[axis.id] === value.id;
                  const possible = valuePossible(axis.id, value.id);
                  return (
                    <button
                      key={value.id}
                      type="button"
                      aria-pressed={active}
                      disabled={!possible}
                      onClick={() => onChoose(axis.id, value.id)}
                      className={[
                        'p-3 rounded-xl flex items-center justify-center text-center transition-all duration-150',
                        'text-[11px] font-semibold',
                        active
                          ? 'bg-[#faf2ee] text-[#9e2a4b] ring-2 ring-[#9e2a4b]'
                          : 'bg-[#faf2ee] text-[#1e1b19] ring-1 ring-[#eee7e3] hover:bg-[#f4ece8]',
                        !possible ? 'line-through opacity-40 cursor-not-allowed' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {value.label}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}
    </section>
  );
}
