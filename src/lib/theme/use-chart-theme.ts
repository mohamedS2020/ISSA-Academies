'use client';

/**
 * Chart colours for the active theme. Recharts needs concrete colour strings
 * as props (not CSS classes), so this reads them from the theme's CSS
 * variables (src/app/globals.css, values in src/styles/brand-tokens.css):
 * the chart follows light/dark, and no colour is written twice.
 *
 * `series` is the categorical order: series 1 Lagoon, series 2 orange.
 * Assign it by position and never cycle it.
 */

import { useMemo } from 'react';
import { useTheme } from './theme-context';

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  /** Legend and label text. */
  text: string;
  series: readonly [string, string];
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  // The provider switches the `.dark` class before it re-renders, so the
  // variables read here already belong to the new theme.
  return useMemo(
    () => ({
      grid: cssVar('--border'),
      axis: cssVar('--muted-foreground'),
      tooltipBg: cssVar('--card'),
      tooltipBorder: cssVar('--border'),
      tooltipText: cssVar('--foreground'),
      text: cssVar('--muted-foreground'),
      series: [cssVar('--chart-1'), cssVar('--chart-2')] as const,
    }),
    // resolvedTheme is the trigger: the values come from the DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme]
  );
}
