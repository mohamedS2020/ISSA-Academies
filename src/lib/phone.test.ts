import { describe, it, expect } from '@jest/globals';
import { normalizePhone, isValidPhone, explainInvalidPhone, phoneSearchFragment } from './phone';
import { loginSchema } from '@/schemas/auth.schema';
import { createUserSchema } from '@/schemas/user.schema';

describe('normalizePhone', () => {
  it.each([
    // Formatting and copy-paste debris
    ['+20 100 123 4567', '+201001234567'],
    ['+20-100-(123)-4567', '+201001234567'],
    ['+20.100.123.4567', '+201001234567'],
    ['‪+201001234567‬', '+201001234567'], // bidi embedding from copy-paste
    ['‏+20 100 123 4567', '+201001234567'], // right-to-left mark
    ['+20 100 123 4567', '+201001234567'], // no-break spaces
    ['​0100‍1234567﻿', '+201001234567'], // zero-width characters, BOM
    ['＋201001234567', '+201001234567'], // full-width plus
    // Digits typed on an Arabic or Persian keyboard
    ['٠١٠٠١٢٣٤٥٦٧', '+201001234567'],
    ['۰۱۰۰۱۲۳۴۵۶۷', '+201001234567'],
    ['+٢٠ ١٠٠ ١٢٣ ٤٥٦٧', '+201001234567'],
    // One login for every spelling of an Egyptian mobile
    ['01001234567', '+201001234567'],
    ['01112345678', '+201112345678'],
    ['01212345678', '+201212345678'],
    ['01512345678', '+201512345678'],
    ['201001234567', '+201001234567'],
    ['00201001234567', '+201001234567'],
    ['+2001001234567', '+201001234567'], // national 0 kept after the country code
    ['(010) 1234-5678', '+201012345678'],
  ])('%j → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ['0501234567', '0501234567'], // Saudi mobile: not Egyptian, kept as typed
    ['+966501234567', '+966501234567'],
    ['0021234567890', '+21234567890'], // 00 is still the international prefix
    ['01312345678', '01312345678'], // 013 is not an Egyptian mobile prefix
    ['0100123456', '0100123456'], // one digit short of a mobile
    ['0223456789', '0223456789'], // Cairo landline: only mobiles are rewritten
  ])('keeps a number it cannot place: %j → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('is idempotent', () => {
    for (const raw of ['01001234567', '+20 100 123 4567', '0501234567', '٠١٠٠١٢٣٤٥٦٧']) {
      expect(normalizePhone(normalizePhone(raw))).toBe(normalizePhone(raw));
    }
  });
});

describe('isValidPhone / explainInvalidPhone', () => {
  it('accepts real numbers in any spelling', () => {
    expect(isValidPhone('010 0123 4567')).toBe(true);
    expect(explainInvalidPhone('+966 50 123 4567')).toBeNull();
  });

  it('names the offending character, with its code point', () => {
    // A letter O where a zero belongs: looks right, is not.
    expect(explainInvalidPhone('01OO1234567')).toBe(
      'contains "O" (U+004F), which is not allowed in a phone number'
    );
    expect(explainInvalidPhone('0100#1234567')).toMatch(/"#" \(U\+0023\)/);
  });

  it('ignores invisible marks rather than reporting them', () => {
    // Copy-paste from WhatsApp or contacts: the number itself is fine.
    expect(explainInvalidPhone('‪+20 100 123 4567‬')).toBeNull();
  });

  it('reports a wrong length in digits', () => {
    expect(explainInvalidPhone('12345')).toBe('has 5 digits; a phone number has 7 to 15');
    expect(explainInvalidPhone('+2010012345678901')).toMatch(/has 16 digits/);
  });

  it('never echoes the number', () => {
    expect(explainInvalidPhone('0100123456x')).not.toContain('0100123456');
  });
});

describe('phoneSearchFragment', () => {
  it.each([
    ['0101234', '101234'], // a national fragment still matches +2010123…
    ['010 1234 5678', '+201012345678'], // a full number matches exactly
    ['+2010', '+2010'],
    ['5678', '5678'],
  ])('%j → %s', (term, fragment) => {
    expect(phoneSearchFragment(term)).toBe(fragment);
    // The point of the fragment: it is found inside the stored number.
    if (fragment.length >= 4) expect('+201012345678').toContain(fragment);
  });

  it('returns null for a name search', () => {
    expect(phoneSearchFragment('Ahmed')).toBeNull();
  });
});

describe('every phone field stores the canonical form', () => {
  it('login', () => {
    const input = loginSchema.parse({ phoneNumber: '٠١٠ ١٢٣٤ ٥٦٧٨', password: 'secret1' });
    expect(input.phoneNumber).toBe('+201012345678');
  });

  it('staff accounts', () => {
    const input = createUserSchema.parse({
      name: 'Mona',
      phoneNumber: '(010) 1234-5678',
      password: 'longenough',
      role: 'MODERATOR',
    });
    // Brackets used to be stored as typed, and the login form rejected them:
    // this account could never have signed in.
    expect(input.phoneNumber).toBe('+201012345678');
  });

  it('rejects a number login could never match', () => {
    expect(loginSchema.safeParse({ phoneNumber: '0100-ABC', password: 'secret1' }).success).toBe(
      false
    );
  });
});
