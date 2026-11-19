'use client';

/**
 * The one way screens format numbers, dates and times:
 *
 *   const f = useFormat();
 *   f.money(plan.amount)       // "EGP 1,400" / "1,400 ج.م", in the academy's currency
 *   f.date(sub.endDate)        // "30 Nov 2026"
 *   f.clock(group.startTime)   // "5:00 PM" or "17:00", as the branch chose
 *   f.duration(minutes)        // "12 h 50 min"
 *   f.percent(82.6)            // "82.6%"
 *   f.count(1250)              // "1,250"
 *
 * It fills in the page language, the academy's currency and the branch's time
 * format (GET /api/settings/display, cached; refetched when the branch
 * changes). Until they load, and for the super admin, it uses EGP and 12-hour.
 */
import { useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/auth-context';
import {
  currencyLabel,
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
  branchTime,
} from '@/lib/i18n/format';
import { DEFAULT_CURRENCY, DEFAULT_TIME_FORMAT, moneyStep, resolveCurrency, type CurrencyCode, type TimeFormat } from './currency';

export interface DisplaySettings {
  currency: CurrencyCode;
  timeFormat: TimeFormat;
}

export const displaySettingsKey = (branchId: string | undefined) => ['settings', 'display', branchId ?? ''] as const;

export function useDisplaySettings(): DisplaySettings {
  const { user } = useAuth();
  const enabled = !!user && user.role !== 'SUPER_ADMIN';
  const { data } = useQuery({
    queryKey: displaySettingsKey(user?.branchId),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DisplaySettings> => {
      const res = await fetch('/api/settings/display');
      if (!res.ok) throw new Error('display settings');
      return (await res.json()).data;
    },
  });
  return { currency: data?.currency ?? DEFAULT_CURRENCY, timeFormat: data?.timeFormat ?? DEFAULT_TIME_FORMAT };
}

export function useFormat() {
  const locale = useLocale();
  const { currency, timeFormat } = useDisplaySettings();
  return useMemo(
    () => ({
      locale,
      currency,
      timeFormat,
      /** "EGP" / "ج.م", for a label like "Price (EGP)". */
      currencyLabel: currencyLabel(currency, locale),
      /** The step of a money input: 0.01, or 0.001 for KWD, BHD, OMR. */
      moneyStep: moneyStep(currency),
      moneyDecimals: resolveCurrency(currency).decimals,
      money: (amount: number | string | null | undefined) => formatMoney(amount, currency, locale),
      count: (n: number) => formatCount(n, locale),
      number: (n: number, options?: Intl.NumberFormatOptions) => formatNumber(n, locale, options),
      percent: (value: number, decimals = 1) => formatPercent(value, locale, decimals),
      duration: (minutes: number) => formatDuration(minutes, locale),
      date: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => formatDate(value, locale, options),
      dateTime: (value: string | number | Date) => formatDateTime(value, locale, timeFormat),
      /** A wall-clock "17:00" (a group's start time). */
      clock: (hhmm: string | null | undefined) => formatClock(hhmm, locale, timeFormat),
      /** A session's branch-local "DD/MM/YYYY, HH:MM" (scheduledAtLocal), time only. */
      sessionTime: (local: string | null | undefined) => formatClock(branchTime(local), locale, timeFormat),
      sessionDate: (local: string | null | undefined, options?: Intl.DateTimeFormatOptions) => formatBranchDate(local, locale, options),
      sessionDateTime: (local: string | null | undefined) => formatBranchDateTime(local, locale, timeFormat),
    }),
    [locale, currency, timeFormat]
  );
}

export type Formatter = ReturnType<typeof useFormat>;
