import { branchDay, branchTime, formatBranchDate, formatBranchDateTime, formatDate, formatNumber, intlLocale, parseBranchLocal } from './format';

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

describe('branch-local session times', () => {
  const local = '17/11/2026, 17:05';

  it('reads the server string', () => {
    expect(parseBranchLocal(local)).toEqual({ day: '2026-11-17', time: '17:05' });
    expect(branchTime(local)).toBe('17:05');
    expect(branchDay(local)).toBe('2026-11-17');
    expect(parseBranchLocal('2026-11-17T17:05')).toBeNull();
  });

  it('prints the branch day whatever the device zone', () => {
    expect(formatBranchDate(local, 'en')).toBe('Tuesday, November 17');
    expect(formatBranchDate(local, 'ar')).toContain('نوفمبر');
    expect(formatBranchDate('01/01/2027, 00:30', 'en', { day: 'numeric', month: 'short' })).toBe('Jan 1');
    expect(formatBranchDateTime(local, 'en')).toBe('Tuesday, November 17 · 17:05');
  });
});
