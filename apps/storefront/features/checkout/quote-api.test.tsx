import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { quoteApi, quoteResult } from './quote-api';
import { sampleQuote } from './quote-test-fixture';
import { formatExactMoney } from '@/lib/format/exact-money';
import { QuoteBreakdown } from './components/quote-breakdown';
import { QuoteLines } from './components/quote-lines';
import { QuoteComparison } from './components/quote-comparison';
import type { CheckoutQuoteDto } from '@maevelle/contracts';
afterEach(() => vi.unstubAllGlobals());
const owner = { kind: 'ACCOUNT' as const, partition: 'a'.repeat(43) };
function response(value: unknown) {
  const f = vi.fn(async (_path: RequestInfo | URL, _init?: RequestInit) => {
    void _path;
    void _init;
    return new Response(JSON.stringify({ data: value }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', f);
  return f;
}
describe('exact quote transport and component presentation', () => {
  it('uses private credentialed no-store reads and exact idempotent write bodies without putting facts in URLs', async () => {
    const q = sampleQuote(),
      f = response(q);
    await quoteApi.current(q.draftId, owner, new AbortController().signal);
    expect(f.mock.calls[0]![1]).toMatchObject({
      credentials: 'include',
      cache: 'no-store',
      headers: { 'x-shopper-partition': owner.partition },
    });
    const body = JSON.stringify({ revision: '2', couponCodes: ['SECRET'] });
    await quoteApi.mutate(
      {
        key: 'same-key',
        owner,
        draftId: q.draftId,
        path: `/api/storefront/v1/checkouts/${q.draftId}/quotes`,
        method: 'POST',
        kind: 'create',
        body,
      },
      new AbortController().signal,
    );
    expect(f.mock.calls[1]![0]).not.toContain('SECRET');
    expect(f.mock.calls[1]![1]).toMatchObject({
      body,
      headers: { 'idempotency-key': 'same-key', 'content-type': 'application/json' },
    });
    await quoteApi.detail(q.draftId, q.id, owner, new AbortController().signal);
    response(null);
    expect(await quoteApi.current(q.draftId, owner, new AbortController().signal)).toBeNull();
  });
  it('accepts legitimate zero facts and string revisions beyond Number precision', () => {
    const q = sampleQuote(undefined, '9007199254740993');
    q.facts.lines = [{ ...q.facts.lines[0]!, unitPrice: '0.0000', gross: '0.0000', net: '0.0000' }];
    q.facts.merchandiseSubtotal = '0.0000';
    q.facts.evaluatedTotal = '0.0000';
    expect(quoteResult(q, q.draftId).facts.shipping).toBe('0.0000');
  });
  it.each(['payable', 'tax', 'paymentFees'] as const)(
    'rejects unsupported final monetary values for %s',
    (field) => {
      const q = sampleQuote();
      const altered = structuredClone(q) as unknown as { facts: Record<string, unknown> };
      altered.facts[field] = '0.0000';
      expect(() => quoteResult(altered as unknown as CheckoutQuoteDto, q.draftId)).toThrow();
    },
  );
  it('rejects foreign quotes, fake readiness, wrong amount types, broken allocation equations and fabricated lifecycle', () => {
    const q = sampleQuote();
    const bad: unknown[] = [
      { ...q, purchaseAvailable: true },
      { ...q, stockReserved: true },
      { ...q, draftId: crypto.randomUUID() },
      { ...q, facts: { ...q.facts, final: true } },
      { ...q, facts: { ...q.facts, evaluatedTotal: '0.0000' } },
      { ...q, acknowledged: true, reviewRequired: true },
      { ...q, status: 'PLACED' },
      { ...q, facts: { ...q.facts, lines: [{ ...q.facts.lines[0], quantity: 1 }] } },
      { ...q, facts: { ...q.facts, shipping: 0 } },
      {
        ...q,
        facts: {
          ...q.facts,
          discounts: [
            {
              promotionId: crypto.randomUUID(),
              revisionId: crypto.randomUUID(),
              couponCodeId: null,
              discount: '1.0000',
              allocations: [],
            },
          ],
        },
      },
    ];
    for (const value of bad)
      expect(() => quoteResult(value as CheckoutQuoteDto, q.draftId)).toThrow();
    expect(() => quoteResult(q, q.draftId, crypto.randomUUID())).toThrow();
  });
  it('formats exact four-place decimals including large and zero values without Number conversion or rounding', () => {
    expect(formatExactMoney('0.0000')).toBe('৳0');
    expect(formatExactMoney('0.3333')).toMatch(/0\.3333/);
    expect(formatExactMoney('9999999999999999.9999', 'BDT', 'en-US')).toContain(
      '9,999,999,999,999,999.9999',
    );
    expect(() => formatExactMoney('0.00001')).toThrow();
    expect(() => formatExactMoney('NaN')).toThrow();
  });
  it('renders unknown amounts honestly, immutable names/SKUs and escaped labels without final-payment controls', () => {
    const q = sampleQuote();
    q.facts.lines = [
      { ...q.facts.lines[0]!, title: '<script>private title</script>', sku: '<b>SKU</b>' },
    ];
    const markup = renderToStaticMarkup(
      <>
        <QuoteLines quote={q} products={{}} handles={{}} />
        <QuoteBreakdown facts={q.facts} />
      </>,
    );
    expect(markup).toContain('&lt;script&gt;private title&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain('Not final payable');
    expect(markup).toContain('Not determined');
    expect(markup).toContain('৳0');
    expect(markup).not.toMatch(/Place order|Pay now|Transfer|Total Payable|stock reserved/i);
  });
  it('compares only authorized predecessor facts and distinguishes equal-total evaluations', () => {
    const previous = sampleQuote(),
      current = { ...sampleQuote(previous.draftId), previousQuoteId: previous.id };
    const markup = renderToStaticMarkup(<QuoteComparison current={current} previous={previous} />);
    expect(markup).toContain('still a separate evaluation');
    expect(
      renderToStaticMarkup(<QuoteComparison current={current} previous={sampleQuote()} />),
    ).toBe('');
    const altered = {
      ...current,
      facts: { ...current.facts, shipping: '12.3333', evaluatedTotal: '112.3333' },
    };
    expect(
      renderToStaticMarkup(<QuoteComparison current={altered} previous={previous} />),
    ).toContain('12.3333');
  });
});
