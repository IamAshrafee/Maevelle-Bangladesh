import { presentMoney } from '@maevelle/contracts';
export function formatMoney(amount: string | number, currency = 'BDT', _locale = 'en-BD'): string {
  void _locale; // Compatibility argument; exact retail labels use the shared English BDT convention.
  return presentMoney(String(amount), { currency }).text;
}

export function wholeQuantity(value: string | number, minimum = 1, maximum = 99): number {
  const parsed = Number(value);
  const integer = Number.isFinite(parsed) ? Math.trunc(parsed) : minimum;
  return Math.min(maximum, Math.max(minimum, integer));
}
