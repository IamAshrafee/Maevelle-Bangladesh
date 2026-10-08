'use client';

import type { PublicSizeGuideDto } from '@maevelle/contracts';
import type { RefObject } from 'react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────────────────────────────────────
 * Data Definitions & Default Atelier Garment Specifications
 * ────────────────────────────────────────────────────────────────────────── */

export interface GarmentSizeRow {
  readonly code: string;
  readonly region: string;
  readonly recommended?: boolean;
  readonly bust: { readonly in: string; readonly cm: string };
  readonly length: { readonly in: string; readonly cm: string };
  readonly shoulder: { readonly in: string; readonly cm: string };
  readonly sleeve: { readonly in: string; readonly cm: string };
}

const DEFAULT_GARMENT_SPECS: readonly GarmentSizeRow[] = [
  {
    code: 'XS',
    region: 'UK 6 • US 2',
    bust: { in: '34.0"', cm: '86.0 cm' },
    length: { in: '24.5"', cm: '62.2 cm' },
    shoulder: { in: '15.0"', cm: '38.1 cm' },
    sleeve: { in: '7.0"', cm: '17.8 cm' },
  },
  {
    code: 'S',
    region: 'UK 8 • US 4',
    recommended: true,
    bust: { in: '36.0"', cm: '91.4 cm' },
    length: { in: '25.0"', cm: '63.5 cm' },
    shoulder: { in: '15.5"', cm: '39.4 cm' },
    sleeve: { in: '7.2"', cm: '18.3 cm' },
  },
  {
    code: 'M',
    region: 'UK 10 • US 6',
    bust: { in: '38.0"', cm: '96.5 cm' },
    length: { in: '25.5"', cm: '64.8 cm' },
    shoulder: { in: '16.0"', cm: '40.6 cm' },
    sleeve: { in: '7.5"', cm: '19.0 cm' },
  },
  {
    code: 'L',
    region: 'UK 12 • US 8',
    bust: { in: '40.0"', cm: '101.6 cm' },
    length: { in: '26.0"', cm: '66.0 cm' },
    shoulder: { in: '16.5"', cm: '41.9 cm' },
    sleeve: { in: '7.8"', cm: '19.8 cm' },
  },
  {
    code: 'XL',
    region: 'UK 14 • US 10',
    bust: { in: '42.0"', cm: '106.7 cm' },
    length: { in: '26.5"', cm: '67.3 cm' },
    shoulder: { in: '17.0"', cm: '43.2 cm' },
    sleeve: { in: '8.0"', cm: '20.3 cm' },
  },
  {
    code: 'XXL',
    region: 'UK 16 • US 12',
    bust: { in: '44.0"', cm: '111.8 cm' },
    length: { in: '27.0"', cm: '68.6 cm' },
    shoulder: { in: '17.5"', cm: '44.5 cm' },
    sleeve: { in: '8.2"', cm: '20.8 cm' },
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
 * Inline Crisp Vector Icons (Zero External Font Dependencies)
 * ────────────────────────────────────────────────────────────────────────── */

function StraightenIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0l12.6 12.6z" />
      <path d="m14.5 12.5 2-2" />
      <path d="m11.5 9.5 2-2" />
      <path d="m8.5 6.5 2-2" />
      <path d="m17.5 15.5 2-2" />
    </svg>
  );
}

function SparklesIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.5a.75.75 0 0 1 .7.48l1.68 4.21a5.25 5.25 0 0 0 2.93 2.93l4.21 1.68a.75.75 0 0 1 0 1.4l-4.21 1.68a5.25 5.25 0 0 0-2.93 2.93l-1.68 4.21a.75.75 0 0 1-1.4 0l-1.68-4.21a5.25 5.25 0 0 0-2.93-2.93L2.48 13.2a.75.75 0 0 1 0-1.4l4.21-1.68a5.25 5.25 0 0 0 2.93-2.93L11.3 2.98a.75.75 0 0 1 .7-.48z" />
      <path d="M19.5 2a.5.5 0 0 1 .47.33l.6 1.5a2.5 2.5 0 0 0 1.4 1.4l1.5.6a.5.5 0 0 1 0 .94l-1.5.6a2.5 2.5 0 0 0-1.4 1.4l-.6 1.5a.5.5 0 0 1-.94 0l-.6-1.5a2.5 2.5 0 0 0-1.4-1.4l-1.5-.6a.5.5 0 0 1 0-.94l1.5-.6a2.5 2.5 0 0 0 1.4-1.4l.6-1.5a.5.5 0 0 1 .47-.33z" />
    </svg>
  );
}

function GlobeIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20z" />
      <path d="M2 12h20" />
    </svg>
  );
}

function TipsIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17h2a2.5 2.5 0 0 0 2.5-2.5c0-1.5-1-2.5-1.5-3.5A6 6 0 1 0 10 11c-.5 1-1.5 2-1.5 3.5z" />
      <path d="M9 18h6" />
      <path d="M10 21h4" />
    </svg>
  );
}

function CheckroomIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4a2 2 0 0 1 2 2c0 1.2-.8 2-2 3L2 15a2 2 0 0 0 1 3h18a2 2 0 0 0 1-3L12 9" />
      <path d="M2 18v2a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

function WaterDropIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

function GrainIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="10" cy="8" r="1.5" />
      <circle cx="14" cy="8" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
      <circle cx="10" cy="16" r="1.5" />
      <circle cx="14" cy="16" r="1.5" />
    </svg>
  );
}

function SupportAgentIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
      <path d="M14 18v1a2 2 0 0 1-2 2h-1" />
    </svg>
  );
}

function WhatsAppIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.886 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.414z" />
    </svg>
  );
}

function CloseIcon({ className = 'w-5 h-5' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckCircleIcon({ className = 'w-4 h-4' }: { readonly className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Props Interface
 * ────────────────────────────────────────────────────────────────────────── */

export interface SizeGuideDialogProps {
  readonly guide?: PublicSizeGuideDto | null | undefined;
  readonly productTitle: string;
  readonly selectedSizeLabel?: string | undefined;
  readonly onSelectSize?: ((label: string) => void) | undefined;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
  readonly dialogRef?: RefObject<HTMLDialogElement | null>;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Sizing Guide Component: Drawer on Mobile, Centered Modal on Desktop
 * ────────────────────────────────────────────────────────────────────────── */

export function SizeGuideDialog({
  guide,
  productTitle,
  selectedSizeLabel,
  onSelectSize,
  isOpen: controlledIsOpen,
  onClose: controlledOnClose,
  dialogRef,
}: SizeGuideDialogProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chart' | 'calculator'>('chart');
  const [unit, setUnit] = useState<'in' | 'cm'>('in');
  const [activeSize, setActiveSize] = useState<string>('S');
  const [confirmedFeedback, setConfirmedFeedback] = useState(false);
  const [userMeasurements, setUserMeasurements] = useState<{
    bust: string;
    length: string;
    shoulder: string;
    sleeve: string;
  }>({ bust: '', length: '', shoulder: '', sleeve: '' });
  const [mounted, setMounted] = useState(false);

  const titleId = useId();
  const isOpen = controlledIsOpen ?? internalIsOpen;

  // Mount check for client portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync selected size label if provided
  useEffect(() => {
    if (selectedSizeLabel) {
      setActiveSize(selectedSizeLabel.toUpperCase());
    }
  }, [selectedSizeLabel]);

  // Support legacy HTMLDialogElement.showModal() via dialogRef
  useEffect(() => {
    if (!dialogRef) return;
    (dialogRef as { current: unknown }).current = {
      showModal: () => setInternalIsOpen(true),
      close: () => {
        setInternalIsOpen(false);
        controlledOnClose?.();
      },
      open: isOpen,
    };
  }, [dialogRef, controlledOnClose, isOpen]);

  const handleClose = useCallback(() => {
    setInternalIsOpen(false);
    controlledOnClose?.();
  }, [controlledOnClose]);

  // Escape key handler & body scroll lock
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose]);

  // Current active size data
  const currentSpec = useMemo(() => {
    return (
      DEFAULT_GARMENT_SPECS.find((s) => s.code.toLowerCase() === activeSize.toLowerCase()) ??
      DEFAULT_GARMENT_SPECS[1]!
    );
  }, [activeSize]);

  // Handle Apply Size action
  const handleApplySize = useCallback(
    (sizeToApply = activeSize) => {
      setConfirmedFeedback(true);
      onSelectSize?.(sizeToApply);

      setTimeout(() => {
        setConfirmedFeedback(false);
        handleClose();
      }, 350);
    },
    [activeSize, onSelectSize, handleClose],
  );

  // Smart size recommendation calculator logic
  const calculatedRecommendation = useMemo(() => {
    const rawBust = Number(userMeasurements.bust);
    if (!Number.isFinite(rawBust) || rawBust <= 0) return null;

    const bustInches = unit === 'in' ? rawBust : rawBust / 2.54;

    if (bustInches <= 34.5) return 'XS';
    if (bustInches <= 36.5) return 'S';
    if (bustInches <= 38.5) return 'M';
    if (bustInches <= 40.5) return 'L';
    if (bustInches <= 42.5) return 'XL';
    return 'XXL';
  }, [userMeasurements.bust, unit]);

  if (!mounted || !isOpen) {
    return null;
  }

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex flex-col justify-end md:justify-center md:items-center"
    >
      {/* ── Dark Backdrop Scrim with Blur ── */}
      <div
        className="fixed inset-0 bg-[#1e1b19]/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* ── Drawer (Mobile) & Modal Container (Desktop) ── */}
      <div
        className={[
          'relative z-10 w-full bg-[#fff8f5] flex flex-col overflow-hidden text-[#1e1b19] font-sans shadow-2xl',
          // Mobile: Bottom sheet drawer
          'rounded-t-[1.75rem] max-h-[92vh] md:max-h-[88vh]',
          // Desktop: Centered modal card
          'md:rounded-3xl md:max-w-4xl lg:max-w-5xl md:border md:border-[#eee7e3] md:my-auto',
          'animate-in fade-in zoom-in-95 duration-200',
        ].join(' ')}
      >
        {/* ── Drag Pull Bar (Mobile only) ── */}
        <div className="flex md:hidden flex-col items-center pt-3 pb-1 shrink-0 bg-[#fff8f5]">
          <div className="w-12 h-1.5 rounded-full bg-[#ddbfc3]/70" />
        </div>

        {/* ── Header Bar ── */}
        <header className="px-5 py-3.5 md:px-7 md:py-4 border-b border-[#eee7e3] flex items-center justify-between gap-3 bg-[#fff8f5]/95 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-full bg-[#ffd9de] text-[#7e0e35] flex items-center justify-center shrink-0">
              <StraightenIcon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-[17px] md:text-[18px] font-semibold text-[#1e1b19] tracking-tight truncate">
                Size &amp; Fit Guide
              </h2>
              <p className="text-[11px] text-[#574144] truncate hidden sm:block">
                Maevelle Atelier Precision Specs • {productTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* View Switcher Tabs */}
            <div className="inline-flex rounded-lg bg-[#f4ece8] p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab('chart')}
                className={[
                  'px-3 py-1.5 rounded-md transition-colors',
                  activeTab === 'chart'
                    ? 'bg-white text-[#9e2a4b] shadow-2xs font-bold'
                    : 'text-[#574144] hover:text-[#1e1b19]',
                ].join(' ')}
              >
                Atelier Chart
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('calculator')}
                className={[
                  'px-3 py-1.5 rounded-md transition-colors',
                  activeTab === 'calculator'
                    ? 'bg-white text-[#9e2a4b] shadow-2xs font-bold'
                    : 'text-[#574144] hover:text-[#1e1b19]',
                ].join(' ')}
              >
                Fit Finder
              </button>
            </div>

            {/* Desktop Esc hint */}
            <span className="hidden md:inline-flex items-center text-[11px] font-mono text-[#8a7174] bg-[#eee7e3] px-1.5 py-0.5 rounded border border-[#ddbfc3]/40">
              Esc
            </span>

            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close Size Guide"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#574144] hover:text-[#9e2a4b] hover:bg-[#eee7e3] transition-colors cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* ── Scrollable Body Content ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 md:px-7 md:py-6 pb-28 md:pb-6 space-y-6">
          {activeTab === 'chart' ? (
            <>
              {/* ── Top Editorial Section ── */}
              <div className="flex flex-col gap-1.5 border-b border-[#eee7e3]/60 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffd9e0] text-[#871a42] text-[11px] font-semibold uppercase tracking-wider">
                    <StraightenIcon className="w-3.5 h-3.5" />
                    Atelier Spec
                  </span>
                  <span className="text-[12px] text-[#574144] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#a63359]" />
                    Maevelle Tailored Fit
                  </span>
                </div>
                <h3 className="font-serif text-[22px] md:text-[26px] font-semibold text-[#1e1b19] tracking-tight leading-snug pt-1">
                  Size Chart &amp; Measurement Guide
                </h3>
                <p className="text-[13px] text-[#574144]">
                  Tailored for Maevelle Women’s Apparel &amp; Relaxed Silhouette
                </p>
              </div>

              {/* ── Responsive 2-Column Grid (Desktop) / Vertical Stack (Mobile) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* ── LEFT COLUMN (7 cols on Desktop): Unit Switcher + Table + Model ── */}
                <div className="lg:col-span-7 flex flex-col gap-5">
                  {/* Segmented Unit Switcher */}
                  <div className="p-3 rounded-2xl bg-[#faf2ee] border border-[#eee7e3] flex flex-col gap-2">
                    <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider uppercase text-[#574144]">
                      <span>Measurement Unit</span>
                      <span className="text-[#a63359] flex items-center gap-1 lowercase first-letter:uppercase">
                        <GlobeIcon className="w-3.5 h-3.5" />
                        BD &amp; Global Standard
                      </span>
                    </div>
                    <div className="grid grid-cols-2 p-1 rounded-xl bg-[#f4ece8] gap-1">
                      <button
                        type="button"
                        onClick={() => setUnit('in')}
                        className={[
                          'py-2 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                          unit === 'in'
                            ? 'bg-white text-[#9e2a4b] shadow-2xs'
                            : 'text-[#574144] hover:text-[#1e1b19]',
                        ].join(' ')}
                      >
                        <span>Inches (in)</span>
                        {unit === 'in' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#ffd9de] text-[#3f0015] font-bold">
                            Active
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnit('cm')}
                        className={[
                          'py-2 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer',
                          unit === 'cm'
                            ? 'bg-white text-[#9e2a4b] shadow-2xs'
                            : 'text-[#574144] hover:text-[#1e1b19]',
                        ].join(' ')}
                      >
                        <span>Centimeters (cm)</span>
                        {unit === 'cm' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#ffd9de] text-[#3f0015] font-bold">
                            Active
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Interactive Measurement Matrix */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[14px] font-semibold text-[#1e1b19]">
                        Precision Garment Specs
                      </span>
                      <span className="text-[11px] text-[#8a7174]">
                        Tap row to select size
                      </span>
                    </div>

                    <div className="w-full rounded-2xl bg-white border border-[#eee7e3] shadow-xs overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[13px]">
                          <thead>
                            <tr className="bg-[#eee7e3] text-[#1e1b19]">
                              <th className="py-3 px-3.5 text-[11px] font-bold uppercase tracking-wider">Size</th>
                              <th className="py-3 px-2 text-[11px] font-bold uppercase tracking-wider">Bust</th>
                              <th className="py-3 px-2 text-[11px] font-bold uppercase tracking-wider">Length</th>
                              <th className="py-3 px-2 text-[11px] font-bold uppercase tracking-wider">Shoulder</th>
                              <th className="py-3 px-3.5 text-[11px] font-bold uppercase tracking-wider text-right">Sleeve</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#eee7e3]/60">
                            {DEFAULT_GARMENT_SPECS.map((row) => {
                              const isSelected = activeSize.toLowerCase() === row.code.toLowerCase();
                              return (
                                <tr
                                  key={row.code}
                                  onClick={() => setActiveSize(row.code)}
                                  className={[
                                    'cursor-pointer transition-colors',
                                    isSelected
                                      ? 'bg-[#ffd9e0]/45 text-[#1e1b19]'
                                      : 'bg-white hover:bg-[#faf2ee]',
                                  ].join(' ')}
                                >
                                  {/* Size Column */}
                                  <td className="py-3 px-3.5">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={[
                                          'font-bold text-[14px]',
                                          isSelected ? 'text-[#7e0e35]' : 'text-[#1e1b19]',
                                        ].join(' ')}
                                      >
                                        {row.code}
                                      </span>
                                      {row.recommended && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-[#9e2a4b] text-white text-[9px] uppercase font-bold tracking-wider">
                                          Recommended
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-[#8a7174] block mt-0.5">
                                      {row.region}
                                    </span>
                                  </td>

                                  {/* Measurements Columns */}
                                  <td className={`py-3 px-2 tabular-nums ${isSelected ? 'font-semibold text-[#7e0e35]' : ''}`}>
                                    {unit === 'in' ? row.bust.in : row.bust.cm}
                                  </td>
                                  <td className={`py-3 px-2 tabular-nums ${isSelected ? 'font-semibold text-[#7e0e35]' : ''}`}>
                                    {unit === 'in' ? row.length.in : row.length.cm}
                                  </td>
                                  <td className={`py-3 px-2 tabular-nums ${isSelected ? 'font-semibold text-[#7e0e35]' : ''}`}>
                                    {unit === 'in' ? row.shoulder.in : row.shoulder.cm}
                                  </td>
                                  <td className={`py-3 px-3.5 text-right tabular-nums ${isSelected ? 'font-semibold text-[#7e0e35]' : ''}`}>
                                    {unit === 'in' ? row.sleeve.in : row.sleeve.cm}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Fit Advice & Model Reference Cards */}
                  <div className="p-4 rounded-2xl bg-[#faf2ee] border border-[#eee7e3] flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#ffd9de] text-[#7e0e35] flex items-center justify-center shrink-0 mt-0.5">
                        <SparklesIcon className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold text-[#1e1b19]">
                          Maevelle Fit Advice
                        </span>
                        <p className="text-[12px] text-[#574144] mt-1 leading-relaxed">
                          This atelier piece runs true to a feminine, relaxed silhouette. For an effortless, languid dawat drape over formal trousers or sarees, consider sizing up one size.
                        </p>
                      </div>
                    </div>

                    {/* Model Reference Card */}
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#eee7e3]/80">
                      <div className="w-11 h-11 rounded-lg bg-[#f4ece8] border border-[#ddbfc3]/50 flex items-center justify-center shrink-0 text-[#7e0e35]">
                        <CheckroomIcon className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[10px] font-bold text-[#a63359] uppercase tracking-wider">
                          Model Reference
                        </span>
                        <p className="text-[12px] text-[#1e1b19] font-medium truncate">
                          5’7” (170cm) • Bust 34” • Wearing Size <strong className="text-[#9e2a4b] font-bold">S</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── RIGHT COLUMN (5 cols on Desktop): How to Measure + Fabric Dynamics ── */}
                <div className="lg:col-span-5 flex flex-col gap-5">
                  {/* How to Measure Card */}
                  <div className="p-4 md:p-5 rounded-2xl bg-[#faf2ee] border border-[#eee7e3] flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full bg-[#ffd9de] text-[#7e0e35] flex items-center justify-center">
                          <StraightenIcon className="w-3.5 h-3.5" />
                        </span>
                        <h4 className="text-[14px] font-semibold text-[#1e1b19]">
                          How to Measure
                        </h4>
                      </div>
                      <span className="text-[11px] font-medium text-[#8a7174]">
                        4 Key Points
                      </span>
                    </div>

                    {/* Illustrated SVG Vector Diagram */}
                    <div className="w-full bg-white p-4 rounded-xl border border-[#eee7e3] flex flex-col items-center justify-center">
                      <svg
                        className="w-full max-w-[260px] h-auto text-[#7e0e35]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 320 220"
                        aria-label="Atelier Garment Pattern Diagram"
                      >
                        {/* Silhouette of Atelier Top */}
                        <path
                          d="M 120 30 Q 160 48 200 30 L 250 65 L 225 105 L 195 90 L 195 200 L 125 200 L 125 90 L 95 105 L 70 65 Z"
                          fill="#FAF2EE"
                          fillOpacity="0.75"
                          stroke="#8A7174"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2.2"
                        />
                        {/* 1: Shoulder Width (Point 3) */}
                        <line stroke="#9E2A4B" strokeDasharray="3 3" strokeWidth="2" x1="120" x2="200" y1="32" y2="32" />
                        <circle cx="120" cy="32" fill="#9E2A4B" r="3" />
                        <circle cx="200" cy="32" fill="#9E2A4B" r="3" />
                        <rect fill="#9E2A4B" height="14" rx="4" width="20" x="150" y="18" />
                        <text fill="#FFFFFF" fontFamily="sans-serif" fontSize="10" fontWeight="bold" textAnchor="middle" x="160" y="29">3</text>

                        {/* 2: Bust (Point 1) */}
                        <line stroke="#9E2A4B" strokeWidth="2.5" x1="125" x2="195" y1="92" y2="92" />
                        <circle cx="125" cy="92" fill="#9E2A4B" r="3.5" />
                        <circle cx="195" cy="92" fill="#9E2A4B" r="3.5" />
                        <rect fill="#9E2A4B" height="14" rx="4" width="20" x="150" y="85" />
                        <text fill="#FFFFFF" fontFamily="sans-serif" fontSize="10" fontWeight="bold" textAnchor="middle" x="160" y="96">1</text>

                        {/* 3: Sleeve (Point 4) */}
                        <line stroke="#9E2A4B" strokeDasharray="3 3" strokeWidth="2" x1="200" x2="250" y1="30" y2="65" />
                        <circle cx="250" cy="65" fill="#9E2A4B" r="3" />
                        <rect fill="#9E2A4B" height="14" rx="4" width="18" x="228" y="38" />
                        <text fill="#FFFFFF" fontFamily="sans-serif" fontSize="10" fontWeight="bold" textAnchor="middle" x="237" y="49">4</text>

                        {/* 4: Body Length (Point 2) */}
                        <line stroke="#9E2A4B" strokeDasharray="3 3" strokeWidth="2" x1="120" x2="120" y1="32" y2="200" />
                        <circle cx="120" cy="200" fill="#9E2A4B" r="3" />
                        <rect fill="#9E2A4B" height="14" rx="4" width="18" x="108" y="115" />
                        <text fill="#FFFFFF" fontFamily="sans-serif" fontSize="10" fontWeight="bold" textAnchor="middle" x="117" y="126">2</text>
                      </svg>
                      <span className="text-[10px] text-[#8a7174] italic mt-2 text-center">
                        Maevelle Atelier Relaxed Pattern Mapping
                      </span>
                    </div>

                    {/* 4 Measurement Points Legend */}
                    <div className="grid grid-cols-1 gap-2 text-[12px]">
                      <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white border border-[#eee7e3]/80">
                        <span className="w-5 h-5 rounded-full bg-[#9e2a4b] text-white text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                        <div>
                          <strong className="text-[#1e1b19] font-semibold">Bust / Chest:</strong>
                          <p className="text-[#574144] text-[11px] mt-0.5">Fullest part of bust, horizontal under armpits.</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white border border-[#eee7e3]/80">
                        <span className="w-5 h-5 rounded-full bg-[#9e2a4b] text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                        <div>
                          <strong className="text-[#1e1b19] font-semibold">Body Length:</strong>
                          <p className="text-[#574144] text-[11px] mt-0.5">Shoulder point straight down to bottom hemline.</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white border border-[#eee7e3]/80">
                        <span className="w-5 h-5 rounded-full bg-[#9e2a4b] text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                        <div>
                          <strong className="text-[#1e1b19] font-semibold">Shoulder Width:</strong>
                          <p className="text-[#574144] text-[11px] mt-0.5">From shoulder seam straight across back to opposite tip.</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2.5 p-2 rounded-xl bg-white border border-[#eee7e3]/80">
                        <span className="w-5 h-5 rounded-full bg-[#9e2a4b] text-white text-[11px] font-bold flex items-center justify-center shrink-0">4</span>
                        <div>
                          <strong className="text-[#1e1b19] font-semibold">Sleeve Length:</strong>
                          <p className="text-[#574144] text-[11px] mt-0.5">Shoulder seam along arm down to cuff edge.</p>
                        </div>
                      </div>
                    </div>

                    {/* Tape Tip */}
                    <div className="p-2.5 rounded-xl bg-[#eee7e3] flex items-center gap-2 text-[11px] text-[#1e1b19]">
                      <TipsIcon className="w-4 h-4 text-[#a63359] shrink-0" />
                      <p>
                        <strong className="text-[#7e0e35] font-semibold">Tape measure tip:</strong> Keep tape snug against body, never pulled tight.
                      </p>
                    </div>
                  </div>

                  {/* Fabric Dynamics & Touch */}
                  <div className="p-4 rounded-2xl bg-[#faf2ee] border border-[#eee7e3] flex flex-col gap-3">
                    <span className="text-[13px] font-semibold text-[#1e1b19]">
                      Fabric Dynamics &amp; Touch
                    </span>
                    <div className="grid grid-cols-1 gap-2 text-[12px]">
                      {/* Stretch Card */}
                      <div className="p-2.5 rounded-xl bg-white border border-[#eee7e3]/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[#f4ece8] text-[#7e0e35] flex items-center justify-center shrink-0">
                            <GrainIcon className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <span className="font-semibold text-[#1e1b19] block">Fabric Stretch</span>
                            <span className="text-[11px] text-[#8a7174]">Cotton • 5% Elastane</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-[#9e2a4b] block">Medium</span>
                          <div className="flex gap-1 mt-0.5 justify-end">
                            <span className="w-3 h-1.5 rounded-full bg-[#9e2a4b]" />
                            <span className="w-3 h-1.5 rounded-full bg-[#9e2a4b]" />
                            <span className="w-3 h-1.5 rounded-full bg-[#eee7e3]" />
                          </div>
                        </div>
                      </div>

                      {/* Wash Behavior Card */}
                      <div className="p-2.5 rounded-xl bg-white border border-[#eee7e3]/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[#f4ece8] text-[#7e0e35] flex items-center justify-center shrink-0">
                            <WaterDropIcon className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <span className="font-semibold text-[#1e1b19] block">Wash Behavior</span>
                            <span className="text-[11px] text-[#8a7174]">Pre-shrunk &amp; washed</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-[#1e1b19] block">&lt;1% Shrink</span>
                          <span className="text-[10px] text-[#8a7174]">Holds true fit</span>
                        </div>
                      </div>

                      {/* Silhouette Card */}
                      <div className="p-2.5 rounded-xl bg-white border border-[#eee7e3]/80 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 rounded-full bg-[#f4ece8] text-[#7e0e35] flex items-center justify-center shrink-0">
                            <CheckroomIcon className="w-3.5 h-3.5" />
                          </span>
                          <div>
                            <span className="font-semibold text-[#1e1b19] block">Silhouette</span>
                            <span className="text-[11px] text-[#8a7174]">Breathable drape</span>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-md bg-[#ffd9e0] text-[#871a42] text-[10px] font-bold">
                          Relaxed Feminine
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Atelier Stylist Desk (WhatsApp) */}
                  <div className="p-4 rounded-2xl bg-[#eee7e3] border border-[#ddbfc3]/50 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-[#7e0e35] text-white flex items-center justify-center shrink-0">
                        <SupportAgentIcon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-[#1e1b19]">
                          Banani Atelier Concierge
                        </span>
                        <span className="w-2 h-2 rounded-full bg-[#17633f] animate-pulse" />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#574144] leading-relaxed">
                      Unsure about your fit across international sizing conventions? Chat with our stylist team on WhatsApp for bespoke guidance.
                    </p>
                    <a
                      href="https://wa.me/8801894000000"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl bg-white text-[#7e0e35] hover:bg-[#7e0e35] hover:text-white transition-colors text-[12px] font-semibold shadow-xs"
                    >
                      <WhatsAppIcon className="w-4 h-4 text-[#25D366]" />
                      <span>WhatsApp Stylist Desk (+880 1894-MAEVELLE)</span>
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── TAB 2: FIND MY SIZE CALCULATOR ── */
            <div className="p-4 md:p-6 rounded-2xl bg-[#faf2ee] border border-[#eee7e3] flex flex-col gap-5">
              <div>
                <h3 className="text-[16px] font-semibold text-[#1e1b19]">
                  Personal Fit Finder
                </h3>
                <p className="text-[12px] text-[#574144] mt-0.5">
                  Input your measurements in {unit === 'in' ? 'inches' : 'centimeters'} to get your tailored Maevelle size recommendation.
                </p>
              </div>

              {/* Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#574144] uppercase tracking-wider mb-1">
                    Bust / Chest ({unit}) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'in' ? 'e.g. 36' : 'e.g. 91.5'}
                    value={userMeasurements.bust}
                    onChange={(e) => setUserMeasurements((p) => ({ ...p, bust: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#ddbfc3] text-[13px] text-[#1e1b19] focus:outline-none focus:border-[#9e2a4b]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#574144] uppercase tracking-wider mb-1">
                    Body Length ({unit})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'in' ? 'e.g. 25' : 'e.g. 63.5'}
                    value={userMeasurements.length}
                    onChange={(e) => setUserMeasurements((p) => ({ ...p, length: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#ddbfc3] text-[13px] text-[#1e1b19] focus:outline-none focus:border-[#9e2a4b]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#574144] uppercase tracking-wider mb-1">
                    Shoulder ({unit})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'in' ? 'e.g. 15.5' : 'e.g. 39.4'}
                    value={userMeasurements.shoulder}
                    onChange={(e) => setUserMeasurements((p) => ({ ...p, shoulder: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#ddbfc3] text-[13px] text-[#1e1b19] focus:outline-none focus:border-[#9e2a4b]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#574144] uppercase tracking-wider mb-1">
                    Sleeve ({unit})
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder={unit === 'in' ? 'e.g. 7.2' : 'e.g. 18.3'}
                    value={userMeasurements.sleeve}
                    onChange={(e) => setUserMeasurements((p) => ({ ...p, sleeve: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-white border border-[#ddbfc3] text-[13px] text-[#1e1b19] focus:outline-none focus:border-[#9e2a4b]"
                  />
                </div>
              </div>

              {/* Recommendation Box */}
              {calculatedRecommendation ? (
                <div className="p-4 rounded-xl bg-[#e8f5ed] border border-[#17633f]/30 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold text-[#17633f] uppercase tracking-wider block">
                      Recommended Atelier Fit
                    </span>
                    <span className="text-[20px] font-serif font-bold text-[#12492f]">
                      Size {calculatedRecommendation}
                    </span>
                    <span className="text-[12px] text-[#17633f] block mt-0.5">
                      Matched closest to your bust measurement of {userMeasurements.bust} {unit}.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSize(calculatedRecommendation);
                      handleApplySize(calculatedRecommendation);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#17633f] text-white font-semibold text-[13px] hover:bg-[#12492f] transition-colors shadow-xs cursor-pointer"
                  >
                    Select Size {calculatedRecommendation} &amp; Apply
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-[#8a7174] italic">
                  Enter your bust measurement above to receive an instant fit recommendation.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Persistent Sticky Bottom Bar / Modal Footer ── */}
        <footer className="fixed md:static inset-x-0 bottom-0 z-20 px-5 py-3 md:px-7 md:py-4 bg-[#fff8f5]/95 backdrop-blur-md border-t border-[#eee7e3] shadow-[0_-8px_24px_rgba(28,25,23,0.08)] md:shadow-none shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:pb-4">
          <div className="flex items-center justify-between gap-4 max-w-4xl mx-auto w-full">
            {/* Confirmed Spec Summary */}
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-bold text-[#8a7174] uppercase tracking-wider">
                Confirmed Spec
              </span>
              <div className="flex items-center gap-1.5 truncate">
                <span className="text-[14px] md:text-[15px] font-bold text-[#7e0e35]">
                  Size {activeSize} ({currentSpec.region.split('•')[0]?.trim() ?? ''})
                </span>
                <span className="text-[#8a7174] text-xs">•</span>
                <span className="text-[13px] text-[#1e1b19] font-medium tabular-nums truncate">
                  Bust {unit === 'in' ? currentSpec.bust.in : currentSpec.bust.cm}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="hidden md:inline-flex px-4 py-2.5 rounded-xl border border-[#ddbfc3] text-[#574144] hover:bg-[#f4ece8] font-semibold text-[13px] transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleApplySize(activeSize)}
                className={[
                  'h-11 px-5 md:px-6 rounded-xl font-semibold text-[13px] flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md active:scale-98',
                  confirmedFeedback
                    ? 'bg-[#17633f] text-white'
                    : 'bg-[#9e2a4b] hover:bg-[#7e0e35] text-white',
                ].join(' ')}
              >
                <span>{confirmedFeedback ? 'Applied ✓' : `Apply Size ${activeSize}`}</span>
                <CheckCircleIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// Named alias for clean semantics
export { SizeGuideDialog as ProductSizeGuideDrawerModal };
