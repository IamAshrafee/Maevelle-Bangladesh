import { presentMoney } from '@maevelle/contracts';
/** Exact significant digits, no rounded payable; integral amounts omit empty decimal suffixes. */
export function formatExactMoney(amount: string, currency = 'BDT', _locale = 'en-BD'): string {
  if (!/^-?\d{1,16}\.\d{4}$/.test(amount) || !/^[A-Z]{3}$/.test(currency))
    throw new Error('Invalid exact money.');
  void _locale; // Compatibility argument; exact retail labels use the shared English BDT convention.
  return presentMoney(amount, { currency }).text;
}
