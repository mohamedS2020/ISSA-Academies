/**
 * The currencies an academy can keep its books in: Egypt and the Gulf.
 *
 * An academy's currency is chosen when it is created and never changes
 * (tenant_configs.currency): changing it would relabel every amount already
 * recorded without converting it. Client-safe.
 */

export const CURRENCY_CODES = ['EGP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  /** Minor units: 3 for the dinar and rial currencies divided into 1,000. */
  decimals: number;
  /** The symbol on Arabic pages; English pages use the ISO code. */
  symbolAr: string;
  nameEn: string;
  nameAr: string;
  /** ISO country, for phone numbers (src/lib/phone.ts). */
  country: 'EG' | 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM';
  /** The time zone a new academy in this currency most likely uses. */
  timezone: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EGP: { code: 'EGP', decimals: 2, symbolAr: 'ج.م', nameEn: 'Egyptian pound', nameAr: 'جنيه مصري', country: 'EG', timezone: 'Africa/Cairo' },
  SAR: { code: 'SAR', decimals: 2, symbolAr: 'ر.س', nameEn: 'Saudi riyal', nameAr: 'ريال سعودي', country: 'SA', timezone: 'Asia/Riyadh' },
  AED: { code: 'AED', decimals: 2, symbolAr: 'د.إ', nameEn: 'UAE dirham', nameAr: 'درهم إماراتي', country: 'AE', timezone: 'Asia/Dubai' },
  KWD: { code: 'KWD', decimals: 3, symbolAr: 'د.ك', nameEn: 'Kuwaiti dinar', nameAr: 'دينار كويتي', country: 'KW', timezone: 'Asia/Kuwait' },
  QAR: { code: 'QAR', decimals: 2, symbolAr: 'ر.ق', nameEn: 'Qatari riyal', nameAr: 'ريال قطري', country: 'QA', timezone: 'Asia/Qatar' },
  BHD: { code: 'BHD', decimals: 3, symbolAr: 'د.ب', nameEn: 'Bahraini dinar', nameAr: 'دينار بحريني', country: 'BH', timezone: 'Asia/Bahrain' },
  OMR: { code: 'OMR', decimals: 3, symbolAr: 'ر.ع', nameEn: 'Omani rial', nameAr: 'ريال عماني', country: 'OM', timezone: 'Asia/Muscat' },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'EGP';

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCY_CODES as readonly string[]).includes(value);
}

/** Any stored value as a known currency; unknown or missing reads as EGP. */
export function resolveCurrency(value: unknown): CurrencyInfo {
  return CURRENCIES[isCurrencyCode(value) ? value : DEFAULT_CURRENCY];
}

/**
 * The smallest step a money input accepts: 0.01. The dinar and rial currencies
 * show 3 decimals (12.500), but every amount column in the database keeps 2,
 * so inputs stop at 0.01 until those columns are widened for fils/baisa.
 */
export function moneyStep(currency: CurrencyCode): string {
  return CURRENCIES[currency].decimals >= 2 ? '0.01' : '1';
}

/** How a branch shows times of day. */
export type TimeFormat = '12h' | '24h';
export const DEFAULT_TIME_FORMAT: TimeFormat = '12h';
export const isTimeFormat = (v: unknown): v is TimeFormat => v === '12h' || v === '24h';
