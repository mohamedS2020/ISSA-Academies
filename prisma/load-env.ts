/**
 * Load .env files for scripts that run outside Next.js (the seed).
 *
 * Next.js reads `.env.local` and `.env`; tsx reads neither, and the Prisma client
 * reads only `.env`, and only once it is constructed. So a value set in
 * `.env.local` — where the README tells you to put the seed's credentials — was
 * silently invisible to the seed.
 *
 * This uses Next's own loader, so a script sees the same variables with the same
 * precedence as the app: real environment variables first, then `.env.local`,
 * then `.env`.
 *
 * Import it FIRST (`import … from './load-env';`). Imports are evaluated in
 * order, so every module imported after it sees the loaded values.
 */

import { loadEnvConfig } from '@next/env';

// Taken before loading. A variable set in the real environment wins over every
// file and is never parsed, so it always arrives exactly as written.
const setInRealEnvironment = new Set(Object.keys(process.env));

// Outside production, read `.env.development*` rather than `.env.production*` —
// the files `next dev` would read on this machine.
const { loadedEnvFiles } = loadEnvConfig(
  process.cwd(),
  process.env.NODE_ENV !== 'production'
);

/**
 * Throw if the .env file format would alter the value of `key`, rather than let
 * a script go on with something other than what is written in the file.
 *
 * Two rules of the format bite passwords in particular, and neither warns:
 *  - an unquoted `#` starts a comment, so `abc#def` is read as `abc`;
 *  - `$NAME` is replaced by another variable's value — even inside single
 *    quotes — so `abc$def` is read as `abc` unless written `abc\$def`.
 *
 * A password shortened this way can still pass a length check, and the account
 * then gets a password that is not the one you wrote down.
 */
export function assertReadVerbatim(key: string): void {
  if (setInRealEnvironment.has(key)) return;

  const definition = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=(.*)$`, 'gm');
  // Files come highest precedence first, so the first file that sets the key is
  // the one whose value was used. Within a file, the last line wins.
  for (const file of loadedEnvFiles) {
    const lines = [...file.contents.matchAll(definition)];
    if (lines.length === 0) continue;

    const written = lines[lines.length - 1][1].trim();
    const quote = /^["'`]/.test(written) ? written[0] : null;
    const closing = quote ? written.indexOf(quote, 1) : -1;
    const value = quote ? written.slice(1, closing === -1 ? undefined : closing) : written;

    if (!quote && written.includes('#')) {
      throw new Error(
        `${key} in ${file.path} contains "#" outside quotes, and a .env file reads ` +
          'an unquoted # as the start of a comment — everything after it is dropped. ' +
          `Put the value in double quotes: ${key}="…"`
      );
    }
    if (/(^|[^\\])\$/.test(value)) {
      throw new Error(
        `${key} in ${file.path} contains "$", which a .env file reads as a reference ` +
          'to another variable — even inside quotes. Write each $ as \\$ ' +
          `(for example ${key}="abc\\$def").`
      );
    }
    return;
  }
}
