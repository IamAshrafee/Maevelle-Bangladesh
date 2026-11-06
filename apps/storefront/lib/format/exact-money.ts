/** Component evaluations retain all four places. This never calculates or rounds a payable amount. */
export function formatExactMoney(amount: string, currency = 'BDT', locale = 'en-BD'): string {
  if (!/^-?\d{1,16}\.\d{4}$/.test(amount) || !/^[A-Z]{3}$/.test(currency))
    throw new Error('Invalid exact money.');
  const negative = amount.startsWith('-');
  const [whole, fraction] = (negative ? amount.slice(1) : amount).split('.') as [string, string];
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(negative ? -BigInt(whole) : BigInt(whole));
  const decimal =
    new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ??
    '.';
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  const tail = fraction
    .split('')
    .map((d) => digits.format(BigInt(d)))
    .join('');
  const lastInteger = parts.findLastIndex((p) => p.type === 'integer');
  const formatted = parts
    .map((p, i) => p.value + (i === lastInteger ? `${decimal}${tail}` : ''))
    .join('');
  return negative && BigInt(whole) === 0n ? `−${formatted}` : formatted;
}
