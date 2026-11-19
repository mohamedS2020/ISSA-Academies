/**
 * Phone numbers: one canonical form for every number the platform stores or
 * compares.
 *
 * A phone number is this app's login identity. The login index, the
 * one-active-account-per-phone rule and every lookup compare it as a plain
 * string, so two spellings of the same number must never reach the database.
 * They used to: numbers were stored exactly as typed, so "010 1234 5678",
 * "01012345678" and the same number in Arabic digits were three different
 * logins, and staff forms accepted brackets that the login form then rejected,
 * so a coach saved as "(010) 1234-5678" could never sign in (hardening plan §26).
 *
 * Client-safe on purpose (no server imports): the login form, the staff forms,
 * the API schemas and the seed all use it, so they cannot disagree again. Keep
 * it in step with `pg_temp.normalize_phone` in the migrations that normalized
 * the numbers already stored (phone.test.ts checks the two agree).
 */

/** Characters copy-paste brings along invisibly: zero-width, direction marks, BOM. */
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** Formatting typed or pasted between the digits (JS `\s` covers no-break spaces). */
const FORMATTING = /[\s\-().]/g;

/** What a canonical number looks like: E.164 allows 15 digits, 7 is the shortest local one. */
export const PHONE_PATTERN = /^\+?[0-9]{7,15}$/;

// ─── Countries ────────────────────────────────────────────────
// An academy's country comes from its currency (src/lib/format/currency.ts):
// Egypt or a Gulf state. A number typed the local way is read in that country.

export type PhoneCountry = 'EG' | 'SA' | 'AE' | 'KW' | 'QA' | 'BH' | 'OM';
export const PHONE_COUNTRIES: PhoneCountry[] = ['EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM'];

interface CountryRule {
  /** International calling code, without the plus. */
  code: string;
  /** The mobile number after the country code, without a trunk 0. */
  mobile: RegExp;
  /** Whether people write it with a leading trunk 0 at home (010…, 05…). */
  trunk: boolean;
  /** How the local form is grouped for reading: digits per group. */
  groups: number[];
  /** How the number after the country code is grouped in international form. */
  intlGroups: number[];
}

const COUNTRY_RULES: Record<PhoneCountry, CountryRule> = {
  // Local reading ⟶ international reading
  EG: { code: '20', mobile: /^1[0125]\d{8}$/, trunk: true, groups: [4, 3, 4], intlGroups: [3, 3, 4] }, // 0100 900 0102 ⟶ +20 100 900 0102
  SA: { code: '966', mobile: /^5\d{8}$/, trunk: true, groups: [3, 3, 4], intlGroups: [2, 3, 4] }, //      050 123 4567 ⟶ +966 50 123 4567
  AE: { code: '971', mobile: /^5[024568]\d{7}$/, trunk: true, groups: [3, 3, 4], intlGroups: [2, 3, 4] },
  KW: { code: '965', mobile: /^[569]\d{7}$/, trunk: false, groups: [4, 4], intlGroups: [4, 4] }, //    5012 3456 ⟶ +965 5012 3456
  QA: { code: '974', mobile: /^[3567]\d{7}$/, trunk: false, groups: [4, 4], intlGroups: [4, 4] },
  BH: { code: '973', mobile: /^[36]\d{7}$/, trunk: false, groups: [4, 4], intlGroups: [4, 4] },
  OM: { code: '968', mobile: /^[79]\d{7}$/, trunk: false, groups: [4, 4], intlGroups: [4, 4] },
};

/**
 * The country a local number is read in when the caller doesn't say: the
 * academy of the current request. The server sets it per request
 * (src/lib/phone-context.ts, from the academy's currency) and the browser from
 * the academy's display settings; anything else reads Egyptian numbers, as
 * before Gulf academies existed.
 */
let currentCountry: () => PhoneCountry = () => 'EG';

export function setPhoneCountryResolver(resolve: () => PhoneCountry): void {
  currentCountry = resolve;
}

/** The country numbers are read in right now (see setPhoneCountryResolver). */
export function phoneCountry(): PhoneCountry {
  return currentCountry();
}

/**
 * Bring a phone number to its one stored form.
 *
 *  1. Arabic-Indic and Persian digits become ASCII; invisible marks, spaces,
 *     dashes, dots and brackets go; a full-width plus becomes "+".
 *  2. The international call prefix 00 becomes "+".
 *  3. Mobiles are stored internationally, so the local and international
 *     spellings are one login. Egyptian ones always (01012345678,
 *     201012345678 and +2001012345678 all become +201012345678), and the
 *     local form of the academy's country: in a Saudi academy 0501234567
 *     becomes +966501234567, in a Kuwaiti one 50012345 becomes +96550012345.
 *     A number written with its country code is kept, whatever the country.
 *
 * Returns the input cleaned but otherwise unchanged when it is not a valid
 * number, so validation (PHONE_PATTERN) can reject it with the real reason.
 */
export function normalizePhone(raw: string, country: PhoneCountry = currentCountry()): string {
  let phone = raw
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/＋/g, '+')
    .replace(INVISIBLE, '')
    .replace(FORMATTING, '');

  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;

  // Egyptian mobiles, in every academy: the stored numbers before Gulf support.
  if (/^01[0125]\d{8}$/.test(phone)) return `+20${phone.slice(1)}`;
  if (/^201[0125]\d{8}$/.test(phone)) return `+${phone}`;
  if (/^\+2001[0125]\d{8}$/.test(phone)) return `+20${phone.slice(4)}`;

  // The academy's country written locally: with its trunk 0, or bare.
  const rule = COUNTRY_RULES[country];
  const local = rule.trunk && phone.startsWith('0') ? phone.slice(1) : phone;
  if (rule.mobile.test(local) && !phone.startsWith('+')) return `+${rule.code}${local}`;

  // Any supported country written with its code but no plus, or with a stray
  // trunk 0 after the code (+966 05…): one stored form.
  for (const r of Object.values(COUNTRY_RULES)) {
    const body = phone.replace(/^\+/, '');
    if (!body.startsWith(r.code)) continue;
    const rest = body.slice(r.code.length).replace(/^0/, '');
    if (r.mobile.test(rest)) return `+${r.code}${rest}`;
  }
  return phone;
}

/**
 * Every stored form a number typed at login could have, one per country:
 * on the main site we don't know the academy yet, and 0501234567 is a Saudi
 * and an Emirati mobile. Login looks all of them up; the password decides.
 */
export function phoneCandidates(raw: string): string[] {
  const forms = PHONE_COUNTRIES.map((c) => normalizePhone(raw, c)).filter((p) => PHONE_PATTERN.test(p));
  return [...new Set(forms)];
}

/**
 * A stored number for reading: the local way for the academy's own country
 * ("0100 900 0102", "050 123 4567", "5012 3456"), grouped internationally for
 * any other ("+966 50 123 4567"). Unknown shapes are returned as stored.
 */
export function formatPhone(stored: string | null | undefined, country: PhoneCountry = currentCountry()): string {
  if (!stored) return '';
  for (const [c, r] of Object.entries(COUNTRY_RULES) as Array<[PhoneCountry, CountryRule]>) {
    if (!stored.startsWith(`+${r.code}`)) continue;
    const national = stored.slice(r.code.length + 1);
    if (!r.mobile.test(national)) continue;
    const own = c === country;
    const digits = own && r.trunk ? `0${national}` : national;
    const parts: string[] = [];
    let i = 0;
    for (const n of own ? r.groups : r.intlGroups) {
      parts.push(digits.slice(i, i + n));
      i += n;
    }
    if (i < digits.length) parts[parts.length - 1] += digits.slice(i);
    const grouped = parts.filter(Boolean).join(' ');
    return own ? grouped : `+${r.code} ${grouped}`;
  }
  return stored;
}

/** True when `raw` normalizes to a valid number. */
export function isValidPhone(raw: string, country?: PhoneCountry): boolean {
  return PHONE_PATTERN.test(normalizePhone(raw, country));
}

/**
 * Why `raw` is not a valid phone number, in words a person can act on, or null
 * when it is valid. Names the offending character with its code point, because
 * the usual culprit is invisible or looks like a digit (a copy-pasted mark, a
 * letter O). Never repeats the number itself, so it is safe to log.
 */
export function explainInvalidPhone(raw: string): string | null {
  const phone = normalizePhone(raw);
  if (PHONE_PATTERN.test(phone)) return null;

  const chars = [...phone];
  const bad = chars.findIndex((ch, i) => !/[0-9]/.test(ch) && !(ch === '+' && i === 0));
  if (bad !== -1) {
    const ch = chars[bad];
    const code = ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0');
    return `contains ${JSON.stringify(ch)} (U+${code}), which is not allowed in a phone number`;
  }

  const digits = phone.replace('+', '').length;
  return `has ${digits} digit${digits === 1 ? '' : 's'}; a phone number has 7 to 15`;
}

/**
 * The part of a search term to look for inside stored numbers, or null when
 * the term holds no digits (a name search).
 *
 * Stored Egyptian mobiles start "+201…", so a national-format fragment such as
 * "0101234" is never a substring of one. Dropping the leading zeros makes it
 * one ("101234"), and still matches numbers kept in their national form.
 */
export function phoneSearchFragment(term: string): string | null {
  const cleaned = normalizePhone(term.trim());
  if (!/[0-9]/.test(cleaned)) return null;
  if (cleaned.startsWith('+')) return cleaned;
  return cleaned.replace(/^0+/, '') || cleaned;
}
