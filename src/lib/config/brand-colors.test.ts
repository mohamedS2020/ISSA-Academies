/**
 * Guards for the brand colours.
 *
 * 1. brand-colors.ts (literal values for PDFs, emails, the root 404) must
 *    match src/styles/brand-tokens.css, the one place colour values live.
 * 2. No hard-coded colours in app code. Pages and components use the theme's
 *    tokens (bg-card, text-primary, border-border …); Tailwind's own palette
 *    (bg-slate-200, text-emerald-600 …) is switched off in globals.css, so a
 *    class like that would silently render nothing. Hex, rgb() and hsl()
 *    values belong in brand-tokens.css, or in brand-colors.ts where CSS
 *    can't reach.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BRAND_COLORS } from './brand-colors';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

describe('brand-colors.ts', () => {
  const css = readFileSync(join(SRC, 'styles', 'brand-tokens.css'), 'utf8');

  it.each(Object.entries(BRAND_COLORS))('%s matches brand-tokens.css', (name, value) => {
    const match = new RegExp(`--ya-${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
    expect(match?.[1]?.toUpperCase()).toBe(value.toUpperCase());
  });
});

describe('app code', () => {
  // Files that may hold literal colour values.
  const ALLOWED = new Set(['src/lib/config/brand-colors.ts']);
  const SKIP_DIRS = ['src/generated'];

  const FAMILIES =
    'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|' +
    'indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe';
  const UTILITIES =
    'bg|text|border(?:-[trblxyse])?|divide|ring(?:-offset)?|outline|from|via|to|fill|stroke|shadow|' +
    'placeholder|accent|caret|decoration';
  // A Tailwind palette colour: a family with a shade (bg-slate-200), or white
  // and black. The brand's own bg-mist and text-slate have no shade.
  const PALETTE_CLASS = new RegExp(
    `(?<![\\w-])(?:[a-z0-9\\[\\]&_.>*-]+:)*(?:${UTILITIES})-(?:(?:${FAMILIES})-\\d{2,3}|white|black)(?:/[\\w.\\[\\]%]+)?(?![\\w-])`,
    'g'
  );
  const COLOR_LITERAL = /(?<![\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?:[0-9a-fA-F]{2})?\b|\b(?:rgba?|hsla?|oklch)\(/g;

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      const rel = relative(ROOT, path).split(sep).join('/');
      if (statSync(path).isDirectory()) return SKIP_DIRS.includes(rel) ? [] : sourceFiles(path);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
    });
  }

  const files = sourceFiles(SRC);

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('uses no Tailwind palette colours', () => {
    const found = files.flatMap((file) =>
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .flatMap((line, i) => (line.match(PALETTE_CLASS) ?? []).map((m) => `${file}:${i + 1}  ${m}`))
    );
    expect(found).toEqual([]);
  });

  it('has no colour values outside brand-colors.ts', () => {
    const found = files
      .filter((file) => !ALLOWED.has(file))
      .flatMap((file) =>
        readFileSync(join(ROOT, file), 'utf8')
          .split('\n')
          .flatMap((line, i) => (line.match(COLOR_LITERAL) ?? []).map((m) => `${file}:${i + 1}  ${m}`))
      );
    expect(found).toEqual([]);
  });
});
