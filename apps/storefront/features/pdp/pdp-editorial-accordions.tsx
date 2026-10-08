'use client';

import { useState } from 'react';
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
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`accordion-${id}`}
        id={`accordion-btn-${id}`}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-4 cursor-pointer select-none min-h-0 border-0 bg-transparent text-left"
      >
        <span className="text-[16px] font-semibold text-[#1e1b19]">{title}</span>
        <ChevronDownIcon
          size={20}
          className={[
            'text-[#8a7174] transition-transform duration-200 shrink-0',
            open ? 'rotate-180' : '',
          ].join(' ')}
        />
      </button>
      {open && (
        <div
          id={`accordion-${id}`}
          role="region"
          aria-labelledby={`accordion-btn-${id}`}
          className="px-4 pb-4 pt-0 text-[14px] text-[#574144] leading-relaxed"
        >
          {content}
        </div>
      )}
    </div>
  );
}

export interface PdpEditorialAccordionsProps {
  readonly productDetails?: readonly { group: string; label: string; value: string }[];
  readonly productFaqs?: readonly { question: string; answer: string }[];
  readonly onFittingGuide?: () => void;
}

export function PdpEditorialAccordions({
  productDetails,
  productFaqs,
  onFittingGuide,
}: PdpEditorialAccordionsProps) {
  const hasDimensions =
    productDetails && productDetails.some((d) => d.group?.toLowerCase().includes('dimension'));

  return (
    <section className="px-4 pt-5 flex flex-col gap-2.5">
      {/* Craftsmanship & Material */}
      <Accordion
        id="craftsmanship"
        title="Craftsmanship &amp; Material"
        defaultOpen
        content={
          <div className="flex flex-col gap-2">
            <p>
              Each piece is hand-fashioned in small batches at our Banani atelier using
              French-milled plush velvet lined with soft mulberry silk backings.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-[12px] text-[#574144]">
              <li>18K gold-electroplated, anti-tarnish tension clasp.</li>
              <li>Snag-free ribbon edges gently cushion hair without causing frizz or snapping fine strands.</li>
              <li>Dual-function design accommodates thick ethnic tresses or fine hair locks.</li>
            </ul>
          </div>
        }
      />

      {/* Dimensions & Styling Guide */}
      <Accordion
        id="dimensions"
        title="Dimensions &amp; Styling Guide"
        content={
          hasDimensions ? (
            <div className="flex flex-col gap-2">
              <dl>
                {productDetails!
                  .filter((d) => d.group?.toLowerCase().includes('dimension'))
                  .map((d) => (
                    <div
                      key={`${d.group}-${d.label}`}
                      className="flex justify-between py-1.5 border-t border-[#eee7e3] first:border-t-0"
                    >
                      <dt className="text-[12px] font-semibold uppercase tracking-wider text-[#8a7174]">
                        {d.label}
                      </dt>
                      <dd className="m-0 text-[16px] font-semibold text-[#1e1b19]">{d.value}</dd>
                    </div>
                  ))}
              </dl>
              <p className="text-[12px] mt-1">
                Ideal for festive Dawat half-up crowns, elegant Eid daytime buns, or low side-swept ponytails.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2 text-center py-2 bg-[#faf2ee] rounded-lg">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7174] block">
                    Ribbon Drop
                  </span>
                  <span className="text-[16px] font-semibold text-[#1e1b19]">18 cm</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#8a7174] block">
                    Bow Width
                  </span>
                  <span className="text-[16px] font-semibold text-[#1e1b19]">12 cm</span>
                </div>
              </div>
              <p className="text-[12px]">
                Ideal for festive Dawat half-up crowns, elegant Eid daytime buns, or low side-swept ponytails.
              </p>
              {onFittingGuide && (
                <button
                  type="button"
                  onClick={onFittingGuide}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#9e2a4b] hover:text-[#7e0e35] underline underline-offset-2 cursor-pointer bg-transparent border-0 p-0"
                >
                  Open Atelier Size &amp; Fit Guide →
                </button>
              )}
            </div>
          )
        }
      />

      {/* Atelier Gift Box Packaging */}
      <Accordion
        id="packaging"
        title="Atelier Gift Box Packaging"
        content={
          <p>
            Arrives beautifully housed in our signature dusty rose sliding drawer keepsake box,
            enveloped in tissue paper, finished with a velvet travel pouch and personalized
            wax-sealed greeting card.
          </p>
        }
      />

      {/* Product details from admin */}
      {productDetails && productDetails.filter((d) => !d.group?.toLowerCase().includes('dimension')).length > 0 ? (
        <Accordion
          id="product-details"
          title="Product Details"
          content={
            <dl>
              {productDetails
                .filter((d) => !d.group?.toLowerCase().includes('dimension'))
                .map((d) => (
                  <div
                    key={`${d.group}-${d.label}`}
                    className="grid grid-cols-2 gap-2 py-1.5 border-t border-[#eee7e3] first:border-t-0"
                  >
                    <dt className="text-[12px] font-semibold text-[#8a7174]">{d.label}</dt>
                    <dd className="m-0 text-[14px] text-[#1e1b19]">{d.value}</dd>
                  </div>
                ))}
            </dl>
          }
        />
      ) : null}

      {/* FAQs */}
      {productFaqs && productFaqs.length > 0 ? (
        <Accordion
          id="faqs"
          title="Questions &amp; Answers"
          content={
            <div className="flex flex-col gap-3">
              {productFaqs.map((faq) => (
                <div key={faq.question}>
                  <p className="font-semibold text-[#1e1b19] mb-1">{faq.question}</p>
                  <p>{faq.answer}</p>
                </div>
              ))}
            </div>
          }
        />
      ) : null}

      {/* Shipping & Returns */}
      <Accordion
        id="shipping"
        title="Shipping &amp; Returns"
        content={
          <p>
            Delivery choices and charges are confirmed during checkout. Return eligibility is
            checked securely against your order.
          </p>
        }
      />
    </section>
  );
}
