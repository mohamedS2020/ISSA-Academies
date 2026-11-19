import {
  branchDay,
  branchTime,
  formatBranchDate,
  formatBranchDateTime,
  formatClock,
  formatCount,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  intlLocale,
  parseBranchLocal,
} from './format';

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

  it('writes dates day first in both languages, never 11/30 vs 30/11', () => {
    expect(formatDate(d, 'en')).toBe('30 Nov 2026');
    expect(formatDate(d, 'ar')).toBe('30 نوفمبر 2026');
    expect(formatNumber(1250.5, 'en')).toBe('1,250.5');
  });

  it('prints a stored calendar day as that day, even west of Greenwich', () => {
    // Subscription ends and birthdays are stored at UTC midnight.
    expect(formatDate('2026-11-30T00:00:00.000Z', 'en')).toBe('30 Nov 2026');
    expect(formatDate('2026-11-30', 'en')).toBe('30 Nov 2026');
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
    expect(formatBranchDate(local, 'en')).toBe('Tuesday 17 November');
    expect(formatBranchDate(local, 'ar')).toContain('نوفمبر');
    expect(formatBranchDate('01/01/2027, 00:30', 'en', { day: 'numeric', month: 'short' })).toBe('1 Jan');
    expect(formatBranchDateTime(local, 'en')).toBe('Tuesday 17 November · 5:05 PM');
    expect(formatBranchDateTime(local, 'en', '24h')).toBe('Tuesday 17 November · 17:05');
  });
});

describe('money', () => {
  it('shows the academy currency, separators, and decimals only when there are some', () => {
    expect(formatMoney(29450, 'EGP', 'en')).toBe('EGP 29,450');
    expect(formatMoney('1400.5', 'EGP', 'en')).toBe('EGP 1,400.50');
    expect(formatMoney(29450, 'EGP', 'ar')).toBe('29,450 ج.م');
    expect(formatMoney(1400.5, 'SAR', 'ar')).toBe('1,400.50 ر.س');
    expect(formatMoney(500, 'AED', 'en')).toBe('AED 500');
  });

  it('uses 3 decimals for the dinar and rial currencies divided into 1,000', () => {
    expect(formatMoney(12.5, 'KWD', 'en')).toBe('KWD 12.500');
    expect(formatMoney(12, 'BHD', 'ar')).toBe('12 د.ب');
    expect(formatMoney(3.25, 'OMR', 'ar')).toBe('3.250 ر.ع');
  });

  it('handles negatives, empty and unknown currencies', () => {
    expect(formatMoney(-300, 'EGP', 'en')).toBe('EGP -300');
    expect(formatMoney(null, 'EGP', 'en')).toBe('EGP 0');
    expect(formatMoney(0.001, 'EGP', 'en')).toBe('EGP 0');
    expect(formatMoney(10, 'XYZ', 'en')).toBe('EGP 10');
  });
});

describe('durations, times, percentages, counts', () => {
  it('shows durations as hours and minutes, never 12.83', () => {
    expect(formatDuration(770, 'en')).toBe('12 h 50 min');
    expect(formatDuration(45, 'en')).toBe('45 min');
    expect(formatDuration(120, 'en')).toBe('2 h');
    expect(formatDuration(770, 'ar')).toBe('12 ساعة و50 دقيقة');
    expect(formatDuration(125, 'ar')).toBe('ساعتان و5 دقائق');
    expect(formatDuration(60, 'ar')).toBe('ساعة');
  });

  it('shows times of day in the branch format', () => {
    expect(formatClock('17:00', 'en')).toBe('5:00 PM');
    expect(formatClock('09:05', 'ar')).toBe('9:05 ص');
    expect(formatClock('17:00', 'ar', '24h')).toBe('17:00');
    expect(formatClock('7:30', 'en', '24h')).toBe('07:30');
    expect(formatDateTime('2026-11-17T19:17:00Z', 'en', '24h')).toMatch(/^17 Nov 2026, \d{2}:17$/);
  });

  it('shows percentages and counts', () => {
    expect(formatPercent(82.6, 'en')).toBe('82.6%');
    expect(formatPercent(63, 'ar', 0)).toBe('63%');
    expect(formatCount(12500, 'ar')).toBe('12,500');
  });
});
