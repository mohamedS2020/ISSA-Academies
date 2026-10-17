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

/**
 * Bring a phone number to its one stored form.
 *
 *  1. Arabic-Indic and Persian digits become ASCII; invisible marks, spaces,
 *     dashes, dots and brackets go; a full-width plus becomes "+".
 *  2. The international call prefix 00 becomes "+".
 *  3. Egyptian mobiles (010, 011, 012, 015 + 8 digits) are stored
 *     internationally, so the national and international spellings are one
 *     login: 01012345678, 201012345678 and +2001012345678 all become
 *     +201012345678. Other countries' numbers are kept as typed; guessing
 *     their country would be wrong as often as right.
 *
 * Returns the input cleaned but otherwise unchanged when it is not a valid
 * number, so validation (PHONE_PATTERN) can reject it with the real reason.
 */
export function normalizePhone(raw: string): string {
  let phone = raw
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/＋/g, '+')
    .replace(INVISIBLE, '')
    .replace(FORMATTING, '');

  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;

  if (/^01[0125]\d{8}$/.test(phone)) return `+20${phone.slice(1)}`;
  if (/^201[0125]\d{8}$/.test(phone)) return `+${phone}`;
  if (/^\+2001[0125]\d{8}$/.test(phone)) return `+20${phone.slice(4)}`;
  return phone;
}

/** True when `raw` normalizes to a valid number. */
export function isValidPhone(raw: string): boolean {
  return PHONE_PATTERN.test(normalizePhone(raw));
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
