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
 * Import it FIRST, as a side-effect import (`import './load-env';`). Imports are
 * evaluated in order, so every module imported after it sees the loaded values.
 */

import { loadEnvConfig } from '@next/env';

// Outside production, read `.env.development*` rather than `.env.production*` —
// the files `next dev` would read on this machine.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
