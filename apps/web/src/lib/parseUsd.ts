/** "$1,250.50" / "1250.5" / "50" → cents; null for anything else (blank, ≤ 0, > 2 decimals, letters). */
export function parseUsd(input: string): number | null {
  const text = input.trim().replace(/^\$/, '');
  if (!/^(\d{1,3}(,\d{3})*|\d+)(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.replaceAll(',', '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}
