'use client';

/**
 * Recharts colors that adapt to the active theme. Recharts needs concrete color
 * strings as props (not CSS classes), so this returns per-theme hex values.
 * Series colors (cyan income, red expense, emerald) stay the same in both themes.
 */

import { useTheme } from './theme-context';

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return {
    grid: dark ? '#1e293b' : '#e2e8f0', // slate-800 / slate-200
    axis: dark ? '#64748b' : '#94a3b8', // slate-500 / slate-400
    tooltipBg: dark ? '#0f172a' : '#ffffff',
    tooltipBorder: dark ? '#1e293b' : '#e2e8f0',
    tooltipText: dark ? '#e2e8f0' : '#0f172a',
  };
}
