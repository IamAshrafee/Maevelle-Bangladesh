export function formatTaka(amount: string | number, currency = 'BDT'): string {
  const num = Math.round(Number(amount));
  if (isNaN(num)) return '৳0';
  if (currency === 'BDT' || !currency) {
    return `৳${num.toLocaleString('en-US')}`;
  }
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(num);
}
