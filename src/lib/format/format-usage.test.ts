/**
 * Numbers, dates and money on screen go through src/lib/i18n/format.ts (via
 * useFormat), never formatted by hand. Hand formatting is how the app ended
 * up with "29450.00" next to "1,400 EGP", "11/30/2026" next to "2026-11-30",
 * hours as "12.83" and a dollar sign in a pound academy.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');

/** Places allowed to format by hand: the formatters themselves, and the marketing site (its own copy). */
// The import template also reads its former "(EGP)" headers, so files already handed out keep working.
const ALLOWED = [/^src\/lib\/i18n\/format\.ts$/, /^src\/lib\/format\//, /marketing/, /^src\/generated\//, /^src\/lib\/import\/template\.ts$/];

const RULES: Array<[RegExp, string]> = [
  [/\.toFixed\(/, 'use fmt.money / fmt.number instead of toFixed'],
  [/\.toLocale(Date|Time)?String\(/, 'use fmt.date / fmt.dateTime / fmt.count instead of toLocale…String'],
  [/['"]EGP['"]|\(EGP\)|ج\.م/, 'use the academy currency (fmt.money, fmt.currencyLabel, DEFAULT_CURRENCY)'],
  [/\bDollarSign\b/, 'a dollar sign in an academy that may count in pounds or riyals: use a neutral money icon'],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    const rel = relative(ROOT, path).split(sep).join('/');
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !ALLOWED.some((a) => a.test(rel)) ? [rel] : [];
  });
}

describe('number formatting', () => {
  const files = sourceFiles(join(ROOT, 'src'));

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(RULES.map(([re, why]) => [why, re] as const))('nothing formats by hand: %s', (_why, re) => {
    const offenders = files.flatMap((rel) =>
      readFileSync(join(ROOT, rel), 'utf8')
        .split('\n')
        .flatMap((line, i) => (re.test(line) && !/^\s*(\/\/|\/?\*)/.test(line) ? [`${rel}:${i + 1}: ${line.trim()}`] : []))
    );
    expect(offenders).toEqual([]);
  });
});
