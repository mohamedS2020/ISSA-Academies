import { describe, it, expect } from '@jest/globals';
import { demoRequestSchema, normalizePhone, platformSettingsSchema } from './lead.schema';

describe('normalizePhone', () => {
  it.each([
    ['+20 100 123 4567', '+201001234567'],
    ['+20-100-(123)-4567', '+201001234567'],
    ['٠١٠٠١٢٣٤٥٦٧', '01001234567'], // Arabic-Indic digits
    ['۰۱۰۰۱۲۳۴۵۶۷', '01001234567'], // Eastern Arabic-Indic (Persian) digits
    ['‪+201001234567‬', '+201001234567'], // bidi embedding from copy-paste
    ['‏+20 100 123 4567', '+201001234567'], // right-to-left mark
    ['+20 100 123 4567', '+201001234567'], // non-breaking spaces
  ])('%j → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

const valid = {
  name: 'Mona Adel',
  academy: 'Aqua Stars',
  phone: '+20 100 123 4567',
  branches: '2-5',
  sport: 'swimming',
  locale: 'ar',
};

describe('demoRequestSchema', () => {
  it('accepts a normal request and stores the normalized phone', () => {
    const result = demoRequestSchema.parse(valid);
    expect(result.phone).toBe('+201001234567');
    expect(result.branches).toBe('2-5');
  });

  it('trims names', () => {
    expect(demoRequestSchema.parse({ ...valid, name: '  Mona  ' }).name).toBe('Mona');
  });

  it.each([
    ['name', { name: 'M' }],
    ['academy', { academy: ' ' }],
    ['phone', { phone: 'call me' }],
    ['phone', { phone: '12345' }],
    ['phone', { phone: '+2010012345678901' }], // longer than E.164 allows
    ['branches', { branches: '3' }],
    ['sport', { sport: 'chess' }],
    ['locale', { locale: 'fr' }],
  ])('rejects a bad %s', (field, override) => {
    const result = demoRequestSchema.safeParse({ ...valid, ...override });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toContain(field);
  });
});

describe('platformSettingsSchema', () => {
  it('accepts an email, trimmed', () => {
    expect(platformSettingsSchema.parse({ leadNotificationEmail: '  me@example.com ' }).leadNotificationEmail).toBe(
      'me@example.com'
    );
  });

  it('accepts an empty value, which turns notifications off', () => {
    expect(platformSettingsSchema.parse({ leadNotificationEmail: '' }).leadNotificationEmail).toBe('');
  });

  it('rejects something that is not an email', () => {
    expect(platformSettingsSchema.safeParse({ leadNotificationEmail: 'not-an-email' }).success).toBe(false);
  });
});
