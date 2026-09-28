/**
 * Platform branding — the single source of truth for the platform's name.
 *
 * The platform has no final name yet. Set NEXT_PUBLIC_APP_NAME to name it
 * everywhere at once. Nothing else in the codebase should spell out a platform
 * name: an earlier version hardcoded the first academy's name in 222 places —
 * page titles, logo badges, trainee codes, cookie names — and this variable was
 * declared in .env.example but never read by anything.
 *
 * Why NEXT_PUBLIC_: the name renders in the browser (login page, logo marks) as
 * well as on the server. Next.js inlines NEXT_PUBLIC_ values into the client
 * bundle AT BUILD TIME, so changing the name requires a rebuild and redeploy —
 * restarting the server is not enough.
 *
 * Scope: this is the PLATFORM's name. An academy's own name lives in its tenant
 * record and is what academy-facing screens should show.
 */

/** Neutral placeholder until a name is chosen. */
const DEFAULT_APP_NAME = 'Academy Platform';

/**
 * The platform's display name.
 *
 * Referenced as `process.env.NEXT_PUBLIC_APP_NAME` literally — Next.js only
 * inlines statically-written references, so this must not be read dynamically.
 */
export const APP_NAME: string =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || DEFAULT_APP_NAME;

/**
 * Short mark for the small circular logo badges: the initials of the name, up
 * to three characters. "Academy Platform" → "AP".
 */
export const APP_MARK: string = deriveMark(APP_NAME);

function deriveMark(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('');
  return (initials || name).slice(0, 3).toUpperCase();
}
