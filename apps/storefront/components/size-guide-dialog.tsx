'use client';

import type { PublicSizeGuideDto } from '@maevelle/contracts';
import type { RefObject } from 'react';
import { useMemo, useState } from 'react';

function convertMeasurement(
  value: string | undefined | null,
  from: 'cm' | 'inch',
  to: 'cm' | 'inch',
): string | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const converted = from === to ? n : from === 'cm' ? n / 2.54 : n * 2.54;
  return Number.isInteger(converted) ? converted.toString() : converted.toFixed(1).replace(/\.0$/, '');
}

export function SizeGuideDialog({
  guide,
  dialogRef,
  productTitle,
  selectedSizeLabel,
  onSelectSize,
}: {
  readonly guide: PublicSizeGuideDto | null | undefined;
  readonly dialogRef: RefObject<HTMLDialogElement | null>;
  readonly productTitle: string;
  readonly selectedSizeLabel?: string | undefined;
  readonly onSelectSize?: ((label: string) => void) | undefined;
}) {
  const [activeTab, setActiveTab] = useState<'chart' | 'calculator'>('chart');
  const [displayUnit, setDisplayUnit] = useState<'cm' | 'inch'>('cm');
  const [userMeasurements, setUserMeasurements] = useState<Record<string, string>>({});

  if (!guide) return null;

  // Extract unique columns (measurement names + instructions)
  const columns = new Map<string, { name: string; instructions: string | null }>();
  for (const row of guide.rows) {
    for (const m of row.measurements) {
      if (!columns.has(m.name)) {
        columns.set(m.name, { name: m.name, instructions: m.instructions });
      }
    }
  }
  const columnArray = Array.from(columns.values());

  // Size Recommendation Logic
  const recommendation = useMemo(() => {
    const inputEntries = Object.entries(userMeasurements).filter(
      ([, val]) => val.trim() !== '' && !Number.isNaN(Number(val)),
    );
    if (inputEntries.length === 0) return null;

    let bestRow: (typeof guide.rows)[number] | null = null;
    let bestScore = -Infinity;

    for (const row of guide.rows) {
      let matchedCount = 0;
      let totalDistance = 0;

      for (const [colName, rawVal] of inputEntries) {
        const userVal = Number(rawVal);
        const m = row.measurements.find((meas) => meas.name === colName);
        if (!m) continue;

        const exact = m.exact ? Number(convertMeasurement(m.exact, m.unit as any, displayUnit)) : null;
        const min = m.min ? Number(convertMeasurement(m.min, m.unit as any, displayUnit)) : null;
        const max = m.max ? Number(convertMeasurement(m.max, m.unit as any, displayUnit)) : null;

        if (min !== null && max !== null) {
          if (userVal >= min && userVal <= max) {
            matchedCount += 2;
          } else if (userVal < min) {
            totalDistance += min - userVal;
          } else {
            totalDistance += (userVal - max) * 1.5; // penalize too small more
          }
        } else if (exact !== null) {
          const diff = Math.abs(userVal - exact);
          if (diff <= 2) matchedCount += 2;
          totalDistance += diff;
        }
      }

      const score = matchedCount * 10 - totalDistance;
      if (score > bestScore) {
        bestScore = score;
        bestRow = row;
      }
    }

    return bestRow ? { size: bestRow.label } : null;
  }, [guide.rows, userMeasurements, displayUnit]);

  return (
    <dialog className="size-guide-dialog" ref={dialogRef}>
      <header>
        <div>
          <p className="eyebrow">{productTitle}</p>
          <h2>{guide.name}</h2>
        </div>
        <button
          type="button"
          aria-label="Close size guide"
          onClick={() => dialogRef.current?.close()}
        >
          ✕
        </button>
      </header>

      <div className="size-guide-content">
        {/* Navigation Tabs between Chart and Fit Calculator */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            borderBottom: '1px solid #e2e8f0',
            marginBottom: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('chart')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === 'chart' ? '#0f172a' : '#64748b',
              borderBottom: activeTab === 'chart' ? '2px solid #0f172a' : '2px solid transparent',
            }}
          >
            Size Chart
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calculator')}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: activeTab === 'calculator' ? '#0f172a' : '#64748b',
              borderBottom:
                activeTab === 'calculator' ? '2px solid #0f172a' : '2px solid transparent',
            }}
          >
            Find My Size Calculator
          </button>
        </div>

        {guide.fitNotes ? (
          <div
            className="fit-notes"
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f8fafc',
              marginBottom: '1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              fontSize: '0.875rem',
            }}
          >
            <strong>Fit Note:</strong> {guide.fitNotes}
          </div>
        ) : null}

        {/* Unit Switcher */}
        <div
          className="unit-switcher"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
            Measurements in: <strong>{displayUnit === 'cm' ? 'Centimeters' : 'Inches'}</strong>
          </span>
          <div
            style={{
              display: 'flex',
              background: '#f1f5f9',
              padding: '0.25rem',
              borderRadius: '0.375rem',
            }}
          >
            <button
              type="button"
              aria-pressed={displayUnit === 'cm'}
              onClick={() => setDisplayUnit('cm')}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.25rem',
                background: displayUnit === 'cm' ? '#fff' : 'transparent',
                boxShadow: displayUnit === 'cm' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                color: displayUnit === 'cm' ? '#0f172a' : '#64748b',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              cm
            </button>
            <button
              type="button"
              aria-pressed={displayUnit === 'inch'}
              onClick={() => setDisplayUnit('inch')}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                borderRadius: '0.25rem',
                background: displayUnit === 'inch' ? '#fff' : 'transparent',
                boxShadow: displayUnit === 'inch' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                color: displayUnit === 'inch' ? '#0f172a' : '#64748b',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              inch
            </button>
          </div>
        </div>

        {activeTab === 'chart' ? (
          <>
            {guide.instructions ? (
              <p
                className="instructions"
                style={{ marginBottom: '1.25rem', fontSize: '0.875rem', color: '#475569' }}
              >
                {guide.instructions}
              </p>
            ) : null}

            <div
              className="table-scroll"
              style={{
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                border: '1px solid #e2e8f0',
                borderRadius: '0.5rem',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  minWidth: '400px',
                  fontSize: '0.875rem',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                    <th
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        background: '#f8fafc',
                        padding: '0.75rem 1rem',
                        fontWeight: 600,
                        borderRight: '1px solid #e2e8f0',
                      }}
                    >
                      Size
                    </th>
                    {columnArray.map((col) => (
                      <th
                        key={col.name}
                        style={{
                          padding: '0.75rem 1rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {col.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {guide.rows.map((row) => {
                    const isSelected =
                      selectedSizeLabel &&
                      row.label.trim().toLowerCase() === selectedSizeLabel.trim().toLowerCase();

                    return (
                      <tr
                        key={row.label}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isSelected ? '#eff6ff' : 'transparent',
                        }}
                      >
                        <th
                          style={{
                            position: 'sticky',
                            left: 0,
                            zIndex: 10,
                            background: isSelected ? '#eff6ff' : '#fff',
                            padding: '0.75rem 1rem',
                            fontWeight: 600,
                            borderRight: '1px solid #e2e8f0',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                          >
                            <span>{row.label}</span>
                            {isSelected && (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  fontWeight: 600,
                                  background: '#dbeafe',
                                  color: '#1e40af',
                                  padding: '0.125rem 0.375rem',
                                  borderRadius: '9999px',
                                }}
                              >
                                Selected
                              </span>
                            )}
                          </div>
                        </th>
                        {columnArray.map((col) => {
                          const m = row.measurements.find((x) => x.name === col.name);
                          if (!m)
                            return (
                              <td
                                key={col.name}
                                style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}
                              >
                                —
                              </td>
                            );
                          const exact = convertMeasurement(m.exact, m.unit as any, displayUnit);
                          const min = convertMeasurement(m.min, m.unit as any, displayUnit);
                          const max = convertMeasurement(m.max, m.unit as any, displayUnit);
                          let text = exact ?? (min && max ? `${min} - ${max}` : min || max || '—');
                          if (m.approximate && text !== '—') text = `~${text}`;
                          return (
                            <td
                              key={col.name}
                              style={{
                                padding: '0.75rem 1rem',
                                whiteSpace: 'nowrap',
                                color: '#334155',
                              }}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          /* Find My Fit Calculator Tab */
          <div
            className="size-calculator"
            style={{
              padding: '1.25rem',
              backgroundColor: '#f8fafc',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
            }}
          >
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: '#0f172a',
                marginBottom: '0.25rem',
              }}
            >
              Enter Your Measurements
            </h3>
            <p style={{ fontSize: '0.8125rem', color: '#64748b', marginBottom: '1rem' }}>
              Input your personal measurements in {displayUnit} to find the best recommended size for this item.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
                marginBottom: '1.25rem',
              }}
            >
              {columnArray.map((col) => (
                <div key={col.name}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {col.name} ({displayUnit})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={`e.g. ${displayUnit === 'cm' ? '88' : '34.5'}`}
                    value={userMeasurements[col.name] ?? ''}
                    onChange={(e) =>
                      setUserMeasurements((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.875rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #cbd5e1',
                      outline: 'none',
                      backgroundColor: '#fff',
                    }}
                  />
                </div>
              ))}
            </div>

            {recommendation ? (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#065f46' }}>
                    Recommended Size:
                  </p>
                  <p
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: '#064e3b',
                      marginTop: '0.125rem',
                    }}
                  >
                    Size {recommendation.size}
                  </p>
                </div>
                {onSelectSize && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSize(recommendation.size);
                      dialogRef.current?.close();
                    }}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: '#fff',
                      backgroundColor: '#059669',
                      borderRadius: '0.375rem',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Select Size {recommendation.size} &amp; Close
                  </button>
                )}
              </div>
            ) : (
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Enter at least one measurement above to view your recommended size.
              </p>
            )}
          </div>
        )}

        {columnArray.some((col) => col.instructions) && (
          <div className="how-to-measure" style={{ marginTop: '2.5rem' }}>
            <h3
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                marginBottom: '1rem',
                borderBottom: '1px solid #e2e8f0',
                paddingBottom: '0.5rem',
              }}
            >
              How to Measure
            </h3>
            <dl
              style={{
                display: 'grid',
                gap: '1rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              }}
            >
              {columnArray
                .filter((col) => col.instructions)
                .map((col) => (
                  <div key={col.name}>
                    <dt style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.875rem' }}>
                      {col.name}
                    </dt>
                    <dd
                      style={{
                        color: '#475569',
                        marginTop: '0.25rem',
                        fontSize: '0.8125rem',
                        lineHeight: 1.4,
                      }}
                    >
                      {col.instructions}
                    </dd>
                  </div>
                ))}
            </dl>
          </div>
        )}
      </div>
    </dialog>
  );
}
