/** Presentation only; never establishes a payable or rounds authoritative values. */
export type MoneyPresentationMode = 'RETAIL' | 'WHOLE_BDT' | 'EXACT' | 'NONFINAL' | 'UNAVAILABLE';
/** Exact comparison for presentation ordering; not a commercial calculation. */
export function compareMoneyAmounts(a: string, b: string): number {
  const units = (v: string) => {
    if (!/^-?\d{1,38}(?:\.\d{1,8})?$/.test(v)) throw new Error('Invalid monetary value');
    const negative = v.startsWith('-'),
      [whole, fraction = ''] = (negative ? v.slice(1) : v).split('.');
    return (negative ? -1n : 1n) * BigInt(`${whole}${fraction.padEnd(8, '0')}`);
  };
  const left = units(a),
    right = units(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
export function presentMoney(
  amount: string | null | undefined,
  { currency = 'BDT', mode = 'RETAIL' }: { currency?: string; mode?: MoneyPresentationMode } = {},
) {
  if (mode === 'UNAVAILABLE' || amount == null)
    return {
      text: 'Amount unavailable',
      kind: 'UNAVAILABLE',
      label: 'Amount unavailable',
    } as const;
  const match = /^(-?)(\d{1,38})(?:\.(\d{1,8}))?$/.exec(amount);
  if (!match || !/^[A-Z]{3}$/.test(currency))
    return {
      text: 'Amount unavailable',
      kind: 'INVALID',
      label: 'Invalid monetary value',
    } as const;
  const [, sign, integer, fraction = ''] = match;
  const whole = BigInt(integer!).toString();
  const tail = mode === 'EXACT' ? fraction : fraction.replace(/0+$/, '');
  const negative = sign === '-' && (whole !== '0' || /[1-9]/.test(fraction));
  const digits = `${negative ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${tail ? `.${tail}` : ''}`;
  const exact = `${currency === 'BDT' ? '৳' : `${currency} `}${digits}`;
  if (mode === 'WHOLE_BDT' && (currency !== 'BDT' || /[1-9]/.test(fraction)))
    return {
      text: 'Amount needs review',
      kind: 'INVALID',
      label: `Whole BDT required; exact value ${exact}`,
    } as const;
  return {
    text: exact,
    kind: mode === 'NONFINAL' ? 'NONFINAL' : tail ? 'EXACT' : 'WHOLE',
    label: `${negative ? 'Negative ' : ''}${whole}${tail ? ` point ${tail.split('').join(' ')}` : ''} ${currency === 'BDT' ? 'Bangladeshi taka' : currency}${mode === 'NONFINAL' ? ', provisional; not final payable' : ''}`,
  } as const;
}
