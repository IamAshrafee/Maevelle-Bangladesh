'use client';

import React, { useMemo } from 'react';

export interface PdpProductDetailsProps {
  readonly description?: string | null;
  readonly productDetails?: readonly { group: string; label: string; value: string }[];
  readonly productFaqs?: readonly { question: string; answer: string }[];
  readonly onFittingGuide?: () => void;
  readonly className?: string;
}

export function PdpProductDetails({
  description,
  productDetails = [],
  productFaqs = [],
  onFittingGuide,
  className = '',
}: PdpProductDetailsProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, { title: string; items: { label: string; value: string }[] }>();
    for (const detail of productDetails) {
      const key = detail.group.trim().toLocaleLowerCase('en');
      const existing = grouped.get(key);
      if (existing) {
        existing.items.push({ label: detail.label, value: detail.value });
      } else {
        grouped.set(key, {
          title: detail.group,
          items: [{ label: detail.label, value: detail.value }],
        });
      }
    }
    return Array.from(grouped.values());
  }, [productDetails]);

  const hasDescription = Boolean(description && description.trim().length > 0);
  const hasGroups = groups.length > 0;
  const hasFaqs = productFaqs.length > 0;

  if (!hasDescription && !hasGroups && !hasFaqs && !onFittingGuide) {
    return null;
  }

  return (
    <section
      aria-label="Product specifications and details"
      className={`flex flex-col gap-9 ${className}`}
    >
      {/* ─── Product Description ─── */}
      {hasDescription && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              The Piece
            </p>
            <h3 className="text-[20px] sm:text-[22px] font-serif font-semibold text-on-surface tracking-tight">
              Story &amp; Silhouette
            </h3>
          </div>
          <div className="text-[14px] sm:text-[15px] leading-relaxed text-on-surface-variant whitespace-pre-line space-y-3 font-normal">
            {description}
          </div>
        </div>
      )}

      {/* ─── Attribute Groups & Key-Value Specifications (Table View, Unboxed) ─── */}
      {hasGroups && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Specifications
            </p>
            <h3 className="text-[20px] sm:text-[22px] font-serif font-semibold text-on-surface tracking-tight">
              Product Details &amp; Craft
            </h3>
          </div>

          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                {groups.length > 1 || group.title.trim().toLocaleLowerCase('en') !== 'key attributes' ? (
                  <h4 className="text-[13px] sm:text-[14px] font-semibold text-on-surface flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    {group.title}
                  </h4>
                ) : null}
                <div className="w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left border-t border-border/40">
                    <tbody>
                      {group.items.map((item, itemIndex) => (
                        <tr
                          key={`${item.label}-${itemIndex}`}
                          className="border-b border-border/40 transition-colors duration-150 hover:bg-black/[0.015]"
                        >
                          <th
                            scope="row"
                            className="py-2.5 sm:py-3 pr-4 text-[12px] sm:text-[13px] font-medium text-outline uppercase tracking-wider w-5/12 sm:w-1/3 align-top font-sans text-left"
                          >
                            {item.label}
                          </th>
                          <td className="py-2.5 sm:py-3 text-[13px] sm:text-[14px] text-on-surface w-7/12 sm:w-2/3 align-top font-normal">
                            {item.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Sizing Guidance Callout (Unboxed, Border-Divided) ─── */}
      {onFittingGuide && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 pb-3 border-t border-b border-border/40">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] sm:text-[14px] font-semibold text-on-surface">
              Need help with sizing?
            </span>
            <span className="text-[12px] text-on-surface-variant">
              Compare garment measurements against your exact fit before ordering.
            </span>
          </div>
          <button
            type="button"
            onClick={onFittingGuide}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-primary text-primary hover:bg-primary hover:text-white transition-colors duration-150 text-[12px] font-semibold cursor-pointer"
          >
            Size Guide &rarr;
          </button>
        </div>
      )}

      {/* ─── Frequently Asked Questions (Unboxed) ─── */}
      {hasFaqs && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Client Inquiries
            </p>
            <h3 className="text-[20px] sm:text-[22px] font-serif font-semibold text-on-surface tracking-tight">
              Frequently Asked Questions
            </h3>
          </div>

          <div className="flex flex-col divide-y divide-border/40 border-t border-b border-border/40">
            {productFaqs.map((faq, index) => (
              <div
                key={`${faq.question}-${index}`}
                className="py-3.5 sm:py-4 flex flex-col gap-1.5"
              >
                <h4 className="text-[14px] sm:text-[15px] font-semibold text-on-surface flex items-start gap-2">
                  <span className="text-primary font-bold text-[13px] shrink-0 mt-0.5">Q.</span>
                  <span>{faq.question}</span>
                </h4>
                <p className="text-[13px] sm:text-[14px] leading-relaxed text-on-surface-variant pl-5 m-0 font-normal">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
