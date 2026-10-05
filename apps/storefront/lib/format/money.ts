export function formatMoney(amount: string, currency = 'BDT', locale = 'en-BD'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}
