/**
 * Every sport in the catalogue is complete: colours for light and dark mode in
 * globals.css, and its mark on disk. A sport missing either still shows in the
 * "Create academy" picker, and its academies get the default colours or a
 * broken favicon.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SPORT, SPORTS, SPORT_KEYS } from './sports';

const ROOT = join(__dirname, '..', '..', '..');
const css = readFileSync(join(ROOT, 'src', 'app', 'globals.css'), 'utf8');

/** The declarations of the first rule whose selector is exactly `selector`. */
function block(selector: string): string | null {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return null;
  return css.slice(at, css.indexOf('}', at));
}

const THEMED = SPORT_KEYS.filter((key) => key !== DEFAULT_SPORT);

describe.each(THEMED)('%s', (key) => {
  it.each([
    [`:root[data-sport="${key}"]`],
    [`.dark:root[data-sport="${key}"]`],
  ])('%s sets primary, accent and ring with their text colours', (selector) => {
    const rule = block(selector);
    expect(rule).not.toBeNull();
    for (const token of ['--primary:', '--primary-foreground:', '--accent:', '--accent-foreground:', '--ring:']) {
      expect(rule).toContain(token);
    }
  });
});

describe.each(SPORT_KEYS)('%s assets', (key) => {
  it('has its logo and favicon in public/', () => {
    expect(existsSync(join(ROOT, 'public', SPORTS[key].logo))).toBe(true);
    expect(existsSync(join(ROOT, 'public', SPORTS[key].favicon))).toBe(true);
  });
});
