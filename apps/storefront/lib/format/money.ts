export function formatMoney(amount: string | number, currency = 'BDT', locale = 'en-BD'): string {
  const value = Number(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function wholeQuantity(value: string | number, minimum = 1, maximum = 99): number {
  const parsed = Number(value);
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : minimum;
  return Math.min(maximum, Math.max(minimum, integer));
}
