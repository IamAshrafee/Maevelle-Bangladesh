'use client';

import { useMemo, useState } from 'react';
import { ChevronDownIcon } from '@/components/ui/icons';

interface AccordionItem {
  readonly id: string;
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly content: React.ReactNode;
}

function Accordion({ id, title, defaultOpen = false, content }: AccordionItem) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-container-lowest shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`accordion-${id}`}
        id={`accordion-btn-${id}`}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-12 w-full cursor-pointer select-none items-center justify-between border-0 bg-transparent p-4 text-left"
      >
        <span className="font-headline-sm text-base font-semibold text-on-surface">{title}</span>
        <ChevronDownIcon
          size={20}
          className={`shrink-0 text-on-surface-variant transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div
          id={`accordion-${id}`}
          role="region"
          aria-labelledby={`accordion-btn-${id}`}
          className="px-4 pb-4 pt-0 text-sm leading-relaxed text-on-surface-variant"
        >
          {content}
        </div>
      ) : null}
    </div>
  );
}

export interface PdpEditorialAccordionsProps {
  readonly productDetails?: readonly { group: string; label: string; value: string }[];
  readonly productFaqs?: readonly { question: string; answer: string }[];
  readonly onFittingGuide?: () => void;
}

function groupId(title: string, index: number): string {
  return `${title.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-')}-${index}`;
}

export function PdpEditorialAccordions({
  productDetails = [],
  productFaqs = [],
  onFittingGuide,
}: PdpEditorialAccordionsProps) {
  const groups = useMemo(() => {
    const grouped = new Map<string, { title: string; items: { label: string; value: string }[] }>();
    for (const detail of productDetails) {
      const key = detail.group.trim().toLocaleLowerCase('en');
      const existing = grouped.get(key);
      if (existing) existing.items.push({ label: detail.label, value: detail.value });
      else
        grouped.set(key, {
          title: detail.group,
          items: [{ label: detail.label, value: detail.value }],
        });
    }
    return [...grouped.values()];
  }, [productDetails]);

  if (groups.length === 0 && productFaqs.length === 0 && !onFittingGuide) return null;

  return (
    <section className="flex flex-col gap-2.5 px-4 pt-5" aria-label="Product information">
      {groups.map((group, index) => (
        <Accordion
          key={`${group.title}-${index}`}
          id={groupId(group.title, index)}
          title={group.title}
          defaultOpen={index === 0}
          content={
            <div className="overflow-hidden rounded-lg border border-border">
              <dl>
                {group.items.map((item, itemIndex) => (
                  <div
                    key={`${item.label}-${itemIndex}`}
                    className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-3 border-t border-border px-3 py-2.5 first:border-t-0 odd:bg-surface-container-low"
                  >
                    <dt className="font-label-sm text-xs font-semibold text-on-surface-variant">
                      {item.label}
                    </dt>
                    <dd className="m-0 text-sm text-on-surface">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          }
        />
      ))}

      {onFittingGuide ? (
        <Accordion
          id="size-and-fit"
          title="Size &amp; fit guide"
          content={
            <div className="space-y-3">
              <p>Compare the product measurements with your own before selecting a size.</p>
              <button
                type="button"
                onClick={onFittingGuide}
                className="inline-flex min-h-10 items-center rounded-full border border-primary px-4 font-label-sm text-xs font-semibold text-primary transition-colors duration-150 hover:bg-primary hover:text-on-primary"
              >
                Open measurement guide
              </button>
            </div>
          }
        />
      ) : null}

      {productFaqs.length > 0 ? (
        <Accordion
          id="faqs"
          title="Questions &amp; answers"
          content={
            <div className="divide-y divide-border">
              {productFaqs.map((faq) => (
                <div key={faq.question} className="py-3 first:pt-0 last:pb-0">
                  <p className="mb-1 font-semibold text-on-surface">{faq.question}</p>
                  <p>{faq.answer}</p>
                </div>
              ))}
            </div>
          }
        />
      ) : null}
    </section>
  );
}
