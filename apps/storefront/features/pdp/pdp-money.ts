import { formatMoney } from '@/lib/format/money';

export function formatTaka(amount: string | number, currency = 'BDT'): string {
  return formatMoney(amount, currency || 'BDT');
}
