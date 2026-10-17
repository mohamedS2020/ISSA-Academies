# CLAUDE.md

## Data rules

- **Phone numbers** go through `phoneNumberField()` (`src/schemas/phone.schema.ts`) in
  every schema, and `normalizePhone` (`src/lib/phone.ts`) anywhere else a phone is
  compared. Stored numbers are canonical (Egyptian mobiles as `+201…`); a phone is a
  login, so two spellings must never reach the database.
- **The login index** (`user_phone_index`) is written only by
  `src/services/login-index.ts`: after any change to a user's phone, active flag,
  branch or role, call `syncLoginIndex(tx, tenantId, userId)` inside the same
  transaction. One active account per phone per academy is a database rule.
- **The ledger** (`financial_transactions`) is written only by `src/services/ledger.ts`,
  in the same transaction as its source row.
- **A trainee's status** is `TraineeProfile.isActive`; `User.isActive` is the account
  that siblings share. Group placement goes through `placeTraineeInGroup`.
- **Rules that must hold under concurrency live in the database** (a constraint, a
  partial unique index, an atomic `UPDATE … RETURNING`, a row lock), not in a
  read-then-write. A transaction does not lock rows it only reads.
- **Permissions** come from one table, `src/lib/auth/access.ts`. Every tenant staff
  route calls `requireAccess(ctx, '<key>')`; pages wrap their content in
  `<RequireAccess access="<key>">` and gate buttons with `useAccess()`. Add or change a
  key there, never an inline `role === 'ADMIN'` or privilege check. Every moderator
  privilege must be granted by some key, and every key used somewhere
  (`access.test.ts` fails otherwise).
- Never edit an applied migration; add a new one in the right folder
  (`prisma/platform/` or `prisma/tenant/`).

## Brand

The platform is **Yallacademy / يلّا أكاديمي** (keep both spellings exactly). The name
lives in `src/lib/config/brand.ts` (`APP_NAMES`, `appName(locale)`); app code doesn't
spell it out anywhere else.

### Colour tokens

- Every colour value lives in `src/styles/brand-tokens.css` (`--ya-*`). Change a colour
  there, never in a component. The landing page reads it directly; the app reads it
  through Tailwind's theme in `src/app/globals.css`.
- In components, use the **semantic** tokens: `bg-background`, `bg-card`, `bg-muted`,
  `text-foreground` (`/80` for secondary labels), `text-muted-foreground`,
  `border-border`, `border-input`, `bg-primary` + `text-primary-foreground`,
  `bg-accent`, `ring-ring`, `text-success` / `bg-success-soft` (and `warning`,
  `danger`), `bg-destructive`. They switch for dark mode by themselves, so write no
  `dark:` colour classes. On academy screens the sport theme recolours only `primary`,
  `accent` and `ring`.
- Brand utilities are fixed and don't switch: `midnight`, `lagoon(-50…900)`,
  `deepsea(-50…900)`, `mist`, `line`, `slate`.
- Tailwind's default palette is switched off. `bg-slate-200`, `text-white` or a hex or
  `rgb()` value in app code fails `src/lib/config/brand-colors.test.ts`. Where CSS
  can't reach (PDFs, emails, the root 404, `themeColor`), use `BRAND_COLORS` from
  `src/lib/config/brand-colors.ts`; the same test keeps it equal to brand-tokens.css.
- Charts take their colours from `useChartTheme()`: series 1 Lagoon, series 2 orange,
  in that order, with a legend. Never cycle them.

### Contrast

- Body text at least 4.5:1; focus rings and chart lines at least 3:1. Every token
  pair passes in light, dark and both sport themes; keep it that way when adding one.
- White text only on Deep Sea or Midnight, never on Lagoon (3.7:1). In practice that
  means `text-primary-foreground` on `bg-primary`. Lagoon is for highlights, rings and
  graphics, not text on white.
- Buttons are solid `bg-primary text-primary-foreground` (destructive:
  `bg-destructive text-destructive-foreground`). No gradient buttons; status colours
  are for states, not actions.
- Primary text on a primary tint: `bg-primary/10` (15–20% falls under 4.5:1 in dark
  mode).

### Font

Readex Pro, one variable font for Arabic and Latin, loaded with `next/font` in
`src/app/[locale]/layout.tsx` (and the marketing layout). Geist Mono is only for codes
(`font-mono`) and isn't preloaded.

### Logo

- Use the brand package's files in `public/assets/img` through
  `src/components/layout/brand-logo.tsx`: `BrandSymbol` (the brand's small cut, for
  anything under 40px tall) and `BrandLogo` (symbol + wordmark, 40px or taller). Both
  include the reversed colourway for dark mode.
- Never redraw, retype, recolour, stretch, rotate or add effects to the mark. Typing
  "Yallacademy" beside the symbol counts as retyping the wordmark: use `BrandLogo`.
- Leave clear space of a quarter of the mark's height on every side.

### Right to left (Arabic)

- `dir` comes from the locale layout. Use logical utilities (`ms-`/`me-`, `ps-`/`pe-`,
  `start-`/`end-`, `text-start`, `border-s`), never left/right.
- Mirror sideways arrows and motion (`rtl:-scale-x-100`, or swap the icon); don't
  mirror the logo or the theme switch (it is `dir="ltr"` on purpose).
- Phone numbers, codes and amounts read left to right: `dir="ltr"` on those fields,
  aligned with the page (`rtl:text-right`).
- Arabic gets no letter-spacing and no uppercase, and text animations split it by
  word, never by letter.
