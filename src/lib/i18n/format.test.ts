import { formatDate, formatNumber, intlLocale } from './format';

describe('formatting in the page language', () => {
  const d = new Date('2026-11-30T10:00:00Z');

  it('uses Western digits on Arabic pages, whatever the phone prefers', () => {
    const ar = formatDate(d, 'ar', { timeZone: 'UTC' });
    expect(ar).toMatch(/30/);
    expect(ar).toMatch(/2026/);
    expect(ar).not.toMatch(/[٠-٩]/);
  });

  it('keeps Arabic month names', () => {
    expect(formatDate(d, 'ar', { timeZone: 'UTC', month: 'long' })).toBe('نوفمبر');
  });

  it('formats English as before', () => {
    expect(formatDate(d, 'en', { timeZone: 'UTC' })).toBe('11/30/2026');
    expect(formatNumber(1250.5, 'en')).toBe('1,250.5');
  });

  it('maps page locales to Intl locales', () => {
    expect(intlLocale('ar')).toBe('ar-EG-u-nu-latn');
    expect(intlLocale('en')).toBe('en-US');
  });
});
