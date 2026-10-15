/**
 * Count-up support: reads the first number out of a figure as it is written
 * in the copy ("EGP 184,500", "18 / 20", "184.5 ألف ج.م") and rebuilds the
 * same string for any value along the way, keeping the prefix, suffix,
 * thousands separators, decimal places and digit style.
 */

const LATIN = '0123456789';
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const NUMBER = /[0-9٠-٩][0-9٠-٩,٬]*(?:[.٫][0-9٠-٩]+)?/;

export interface CountFormat {
  /** The number as written, e.g. 184500 for "EGP 184,500". */
  value: number;
  /** The full string with `current` in place of the number. */
  format(current: number): string;
}

const toLatin = (digits: string) =>
  digits.replace(/[٠-٩]/g, (digit) => String(ARABIC_INDIC.indexOf(digit)));

export function parseCount(text: string): CountFormat | null {
  const match = NUMBER.exec(text);
  if (!match) return null;

  const raw = match[0];
  const prefix = text.slice(0, match.index);
  const suffix = text.slice(match.index + raw.length);
  const arabicDigits = /[٠-٩]/.test(raw);
  const groupSeparator = raw.includes('٬') ? '٬' : raw.includes(',') ? ',' : '';
  const decimalSeparator = raw.includes('٫') ? '٫' : '.';
  const [integerPart, fractionPart = ''] = toLatin(raw.replace(/[,٬]/g, '')).split(/[.٫]/);
  const decimals = fractionPart.length;
  const value = Number(decimals ? `${integerPart}.${fractionPart}` : integerPart);

  function format(current: number): string {
    const [whole, fraction] = Math.max(0, current).toFixed(decimals).split('.');
    const grouped = groupSeparator ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator) : whole;
    let digits = fraction ? `${grouped}${decimalSeparator}${fraction}` : grouped;
    if (arabicDigits) digits = digits.replace(/[0-9]/g, (digit) => ARABIC_INDIC[LATIN.indexOf(digit)]);
    return `${prefix}${digits}${suffix}`;
  }

  return { value, format };
}
