import {
  activationWindow,
  addUtcDays,
  isStillRunning,
  lastDayOfUtcMonth,
  paymentStatusFor,
  renewalWindow,
  subscriptionEndDate,
  utcDay,
} from './renewal';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const ymd = (date: Date) => date.toISOString().slice(0, 10);

const monthly = { periodType: 'FROM_MONTH_START', periodDays: null };
const days30 = { periodType: 'FROM_SUBSCRIPTION_DATE', periodDays: 30 };

const running = (endDate: string, attended = 3, total = 8) => ({
  status: 'ACTIVE',
  endDate: d(endDate),
  attendedSessions: attended,
  totalSessions: total,
});

describe('calendar helpers', () => {
  it('drops the time of day', () => {
    expect(ymd(utcDay(new Date('2026-11-17T23:59:59.999Z')))).toBe('2026-11-17');
  });

  it('adds days across month and year ends', () => {
    expect(ymd(addUtcDays(d('2026-11-30'), 1))).toBe('2026-12-01');
    expect(ymd(addUtcDays(d('2026-12-31'), 1))).toBe('2027-01-01');
  });

  it('finds the last day of a month, leap years included', () => {
    expect(ymd(lastDayOfUtcMonth(d('2026-12-01')))).toBe('2026-12-31');
    expect(ymd(lastDayOfUtcMonth(d('2028-02-10')))).toBe('2028-02-29');
    expect(ymd(lastDayOfUtcMonth(d('2027-02-10')))).toBe('2027-02-28');
  });
});

describe('subscriptionEndDate', () => {
  it('runs a day-based plan for periodDays from its start', () => {
    expect(ymd(subscriptionEndDate(days30, d('2026-12-01')))).toBe('2026-12-31');
  });

  it('runs a monthly plan to the end of its start month', () => {
    expect(ymd(subscriptionEndDate(monthly, d('2026-12-01')))).toBe('2026-12-31');
    expect(ymd(subscriptionEndDate(monthly, d('2026-12-17')))).toBe('2026-12-31');
  });

  it('refuses a day-based plan without periodDays instead of returning Invalid Date', () => {
    expect(() =>
      subscriptionEndDate({ periodType: 'FROM_SUBSCRIPTION_DATE', periodDays: null }, d('2026-12-01'))
    ).toThrow(/periodDays/);
  });
});

describe('isStillRunning', () => {
  it('is running before the end date with sessions left', () => {
    expect(isStillRunning(running('2026-11-30'), new Date('2026-11-17T10:00:00Z'))).toBe(true);
  });

  it('is valid THROUGH the end date, and over the next day', () => {
    expect(isStillRunning(running('2026-11-30'), new Date('2026-11-30T23:59:00Z'))).toBe(true);
    expect(isStillRunning(running('2026-11-30'), new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });

  it('is over once every session is used, whatever the date', () => {
    expect(isStillRunning(running('2026-11-30', 8, 8), new Date('2026-11-17T10:00:00Z'))).toBe(false);
  });

  it('is not running unless ACTIVE', () => {
    const expired = { ...running('2026-11-30'), status: 'EXPIRED' };
    expect(isStillRunning(expired, new Date('2026-11-17T10:00:00Z'))).toBe(false);
  });
});

describe('renewalWindow', () => {
  const now = new Date('2026-11-17T10:00:00Z');

  it('queues a renewal bought while the current one runs: it starts the day after', () => {
    const w = renewalWindow(monthly, running('2026-11-30'), now);
    expect(w.queued).toBe(true);
    expect(ymd(w.startDate)).toBe('2026-12-01');
    expect(ymd(w.endDate)).toBe('2026-12-31');
  });

  it('gives a day-based renewal its full length after the current one', () => {
    const w = renewalWindow(days30, running('2026-11-25'), now);
    expect(w.queued).toBe(true);
    expect(ymd(w.startDate)).toBe('2026-11-26');
    expect(ymd(w.endDate)).toBe('2026-12-26');
  });

  it('starts today when there is no current subscription', () => {
    const w = renewalWindow(monthly, null, now);
    expect(w.queued).toBe(false);
    expect(ymd(w.startDate)).toBe('2026-11-17');
    expect(ymd(w.endDate)).toBe('2026-11-30');
  });

  it('starts today when the current one ended by date but the nightly job has not run yet', () => {
    const w = renewalWindow(days30, running('2026-11-16'), now);
    expect(w.queued).toBe(false);
    expect(ymd(w.startDate)).toBe('2026-11-17');
  });

  it('starts today when the current one used every session', () => {
    const w = renewalWindow(days30, running('2026-11-30', 8, 8), now);
    expect(w.queued).toBe(false);
    expect(ymd(w.startDate)).toBe('2026-11-17');
  });
});

describe('activationWindow', () => {
  const plannedMonthly = { startDate: d('2026-12-01'), endDate: d('2026-12-31') };
  const plannedDays = { startDate: d('2026-12-01'), endDate: d('2026-12-31') };

  it('keeps the planned dates when activated on time', () => {
    const w = activationWindow(monthly, plannedMonthly, new Date('2026-12-01T00:05:00Z'));
    expect([ymd(w.startDate), ymd(w.endDate)]).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('keeps the planned dates when the nightly job runs late', () => {
    const w = activationWindow(days30, plannedDays, new Date('2026-12-03T00:05:00Z'));
    expect([ymd(w.startDate), ymd(w.endDate)]).toEqual(['2026-12-01', '2026-12-31']);
  });

  it('starts an early day-based renewal today and runs it its full length', () => {
    const w = activationWindow(days30, plannedDays, new Date('2026-11-20T17:00:00Z'));
    expect([ymd(w.startDate), ymd(w.endDate)]).toEqual(['2026-11-20', '2026-12-20']);
  });

  it('starts an early monthly renewal today but keeps the whole month it paid for', () => {
    const w = activationWindow(monthly, plannedMonthly, new Date('2026-11-20T17:00:00Z'));
    expect([ymd(w.startDate), ymd(w.endDate)]).toEqual(['2026-11-20', '2026-12-31']);
  });
});

describe('paymentStatusFor', () => {
  it.each([
    [0, 900, 'UNPAID'],
    [400, 900, 'PARTIAL'],
    [900, 900, 'PAID'],
  ] as const)('%d of %d is %s', (paid, price, status) => {
    expect(paymentStatusFor(paid, price)).toBe(status);
  });
});
