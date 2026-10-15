/**
 * Brand colours as literal values, for the few places CSS variables can't
 * reach: PDF exports (react-pdf has no CSS), notification emails (mail clients
 * ignore CSS variables), the self-contained root 404 page, and the browser's
 * theme-color meta tag. Everywhere else, use the Tailwind tokens (bg-card,
 * text-primary, border-border …).
 *
 * Each key is the name of a variable in src/styles/brand-tokens.css without
 * its `--ya-` prefix, and each value must equal it: brand-colors.test.ts
 * fails if they ever differ. Change a colour in brand-tokens.css first, then
 * here.
 */
export const BRAND_COLORS = {
  midnight: '#001219',
  'midnight-2': '#04222C',
  lagoon: '#0A9396',
  'lagoon-300': '#84C9CA',
  'deep-sea': '#005F73',
  'deepsea-800': '#00313D',
  white: '#FFFFFF',
  mist: '#EEF4F4',
  line: '#D6E2E3',
  slate: '#4F6268',
  'on-dark-muted': '#A9BFC4',
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;

/** A brand colour with transparency, as `rgba()`, for shadows and overlays. */
export function brandRgba(color: BrandColor, alpha: number): string {
  const hex = BRAND_COLORS[color].slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
