/**
 * Turning what a person typed into an Excel cell into a value, the forgiving
 * way: Arabic digits, "17:00" or "5:00 م", dates as Excel dates or typed as
 * 31/12/2015, days in either language. Each returns null when the cell can't
 * be read; the caller reports which cell and why. Pure; client-safe.
 */
import { normalizePhone, PHONE_PATTERN } from '@/lib/phone';
import { DAY_NAMES, PAY_TYPE_OPTIONS, PERIOD_OPTIONS, type Weekday } from './template';

/** What exceljs hands back for a cell, flattened (see read.ts). */
export type CellValue = string | number | boolean | Date | null;

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
/** Arabic-Indic and Persian digits to 0-9. */
export function westernDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** The cell as trimmed text ('' when empty). */
export function text(v: CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim();
}

export const isBlank = (v: CellValue) => text(v) === '';

/** A number typed with Arabic digits, a comma for thousands or "ج.م" after it. */
export function number(v: CellValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = westernDigits(text(v))
    .replace(/[٫]/g, '.')
    .replace(/[,،٬\s]/g, '')
    .replace(/(ج\.?م|egp|le|%)$/i, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function integer(v: CellValue): number | null {
  const n = number(v);
  return n != null && Number.isInteger(n) ? n : null;
}

/** A phone in its stored form, or null when it isn't a valid number. */
export function phone(v: CellValue): string | null {
  let raw = typeof v === 'number' ? String(v) : text(v);
  // Excel stores 01012345678 typed into a number cell as 1012345678.
  if (/^1[0125]\d{8}$/.test(raw)) raw = `0${raw}`;
  const normalized = normalizePhone(raw);
  return PHONE_PATTERN.test(normalized) ? normalized : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // 31/02
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * A calendar date as YYYY-MM-DD. Excel dates arrive as Date objects at UTC
 * midnight (exceljs), or as serial numbers; typed ones as day/month/year (the
 * Egyptian order) or year-month-day.
 */
export function date(v: CellValue): string | null {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return isoDate(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (v < 1 || v > 200000) return null;
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = westernDigits(text(v));
  let m = /^(\d{1,2})[/.\-\\](\d{1,2})[/.\-\\](\d{4})$/.exec(s);
  if (m) return isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})[/.\-\\](\d{1,2})[/.\-\\](\d{1,2})$/.exec(s);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** A time of day as HH:MM (24 hours). */
export function time(v: CellValue): string | null {
  let minutes: number | null = null;
  if (v instanceof Date) {
    minutes = v.getUTCHours() * 60 + v.getUTCMinutes();
  } else if (typeof v === 'number') {
    // An Excel time is a fraction of a day.
    if (v >= 0 && v < 1) minutes = Math.round(v * 24 * 60);
  } else {
    const s = westernDigits(text(v)).toLowerCase().replace(/\s+/g, ' ');
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|صباحا|صباحًا|مساء|مساءً)?$/.exec(s);
    if (m) {
      let h = Number(m[1]);
      const min = m[2] ? Number(m[2]) : 0;
      const suffix = m[3];
      if (!m[2] && !suffix) return null; // "17" alone is too ambiguous
      if (suffix) {
        if (h < 1 || h > 12) return null;
        const pm = /^(pm|p\.m\.|م|مساء|مساءً)$/.test(suffix);
        h = (h % 12) + (pm ? 12 : 0);
      }
      if (h <= 23 && min <= 59) minutes = h * 60 + min;
    }
  }
  if (minutes == null || minutes < 0 || minutes >= 24 * 60) return null;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "a, b، c" → ['a', 'b', 'c'], blanks dropped. */
export function list(v: CellValue): string[] {
  return text(v)
    .split(/[,،؛;/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const DAY_LOOKUP = new Map<string, Weekday>(
  (Object.entries(DAY_NAMES) as Array<[Weekday, string[]]>).flatMap(([day, names]) => names.map((n) => [n.toLowerCase(), day] as [string, Weekday]))
);

/**
 * Weekdays as DayOfWeek values. `unknown` lists the words that aren't days;
 * `repeated` is true when a day is written twice.
 */
export function days(v: CellValue): { days: Weekday[]; unknown: string[]; repeated: boolean } {
  const words = text(v)
    .split(/[,،؛;/\n]+|\s+(?:و|and|&)\s+|\s+-\s+/)
    .flatMap((part) => {
      const p = part.trim();
      // "Sat Mon Wed": several days separated by spaces only.
      return DAY_LOOKUP.has(p.toLowerCase()) ? [p] : p.split(/\s+/);
    })
    .map((w) => w.trim().replace(/^و(?=ال)/, '')) // "والاثنين"
    .filter(Boolean);
  const out: Weekday[] = [];
  const unknown: string[] = [];
  let repeated = false;
  for (const w of words) {
    const day = DAY_LOOKUP.get(w.toLowerCase());
    if (!day) unknown.push(w);
    else if (out.includes(day)) repeated = true;
    else out.push(day);
  }
  return { days: out, unknown, repeated };
}

/** Matches a dropdown choice by its full label or either language's half. */
function choice<K extends string>(v: CellValue, options: Record<K, { en: string; ar: string }>): K | null {
  const s = text(v).toLowerCase();
  if (!s) return null;
  for (const [key, o] of Object.entries(options) as Array<[K, { en: string; ar: string }]>) {
    const labels = [o.en, o.ar, `${o.en} / ${o.ar}`].map((l) => l.toLowerCase());
    if (labels.includes(s)) return key;
  }
  return null;
}

export const period = (v: CellValue) => choice(v, PERIOD_OPTIONS);
export const payType = (v: CellValue) => choice(v, PAY_TYPE_OPTIONS);

/** For comparing names typed in two places: case, spaces and Arabic letter variants. */
export function nameKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[إأآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '') // harakat, tatweel
    .replace(/\s+/g, ' ')
    .trim();
}
