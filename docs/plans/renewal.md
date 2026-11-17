# Subscription renewal — plan and progress

Branch: `claude/confident-bohr-axqmch` (started from `main` @ 2757de2).
This file is the hand-off note: if work is interrupted, read it first, then `git log` on the branch.

## What the user asked for (confirmed 2026-11-17)

1. Dashboard "Expiring soon" → **Renew** opens the trainee's page with the renew popup already open
   (today it links to `/subscriptions`, the plans page).
2. Trainee page always offers **Renew** once the trainee has had a subscription, with a banner when the
   current one is near its end (≤ 7 days or ≤ 2 sessions left) or has ended.
   (Bug today: the page loads only the ACTIVE subscription, and the Renew button shows only when it is NOT
   active, so it never shows.)
3. Renew popup: prefilled with the current plan, level and group; shows price, new start and end dates and
   the amount paid now (default = full price, editable: partial or 0); "Change details" lets the user switch
   plan (levels, groups and price follow), level and group (seats shown).
4. Renew any time. If the current subscription is still running, the new one is **queued** (status
   `UPCOMING`) and starts the day after the current one ends, automatically. If it has already ended, the new
   one starts today.
5. Money is recorded at once (receipt + ledger + audit), as with enrolment.

## Decisions (the user confirmed all eight recommendations)

| # | Decision |
|---|---|
| 1 | Current subscription uses all its sessions before its end date → the queued renewal starts **immediately** (the day the last session is marked). |
| 2 | Unused sessions are **not** carried over; the existing makeup window is unchanged. |
| 3 | A group change takes effect **when the renewal starts**; seats are checked at renewal time counting other queued moves into that group, and again at activation (if full then, the trainee stays in the old group and an audit entry says why). |
| 4 | Monthly (`FROM_MONTH_START`) plans renewed early cover the **next calendar month**. |
| 5 | At most **one** queued renewal per trainee — partial unique index, like "one ACTIVE". |
| 6 | Cancelling a queued renewal: **admin only, only while nothing has been paid** on it (no receipts). |
| 7 | Dashboard "Expiring soon": trainees who already renewed show **"Renewed ✓"** instead of Renew. |
| 8 | Permissions: renewing = existing `enroll` access key; paying the rest = existing `recordPayments`. Cancel = new admin-only key. |

## Rules (exact)

- **Renewal window**
  - Current subscription running (ACTIVE, not ended by date or sessions): start = current `endDate` + 1 day.
  - Otherwise: start = today; a still-ACTIVE-but-ended current row is set EXPIRED (expiredAt as the expiry job would).
  - End: `FROM_SUBSCRIPTION_DATE` → start + `periodDays`; `FROM_MONTH_START` → last day of start's month.
- **Activation of a queued renewal** (old one EXPIRED in the same transaction, then `UPDATE … WHERE status='UPCOMING'`):
  - by the nightly expiry job, right after it expires subscriptions (before releasing lapsed seats);
  - by `submitAttendance`, when the mark that uses the last session expires the current one;
  - start = activation day; end = `FROM_SUBSCRIPTION_DATE`: start + periodDays, `FROM_MONTH_START`: keep the planned end (whole queued month);
  - trainee's profile level = renewal level; group = renewal `group_id` via `placeTraineeInGroup` (if full: keep old group + audit).
- **Money**: server computes `amountDue` and `paymentStatus` (PAID / PARTIAL / UNPAID); `amountPaid > price` → 400.
  Receipt + ledger INCOME only when `amountPaid > 0`.
- **"Current subscription" everywhere = latest by createdAt with status ≠ UPCOMING.**

## Files

Database
- `prisma/tenant/schema.prisma` — `UPCOMING` in `SubscriptionStatus`; `TraineeSubscription.groupId` (nullable, FK groups); archive mirror column.
- `prisma/tenant/migrations/20261117000000_subscription_renewal_queue/migration.sql` — enum value + `group_id` columns.
- `prisma/tenant/migrations/20261117000100_one_upcoming_per_trainee/migration.sql` — partial unique index (separate migration: a new enum value cannot be used in the transaction that adds it).

Backend
- `src/types/index.ts` — `SubscriptionStatus.UPCOMING`.
- `src/lib/utils/renewal.ts` (+ `renewal.test.ts`) — pure date maths: renewal window, activation dates, payment status.
- `src/services/subscription.service.ts` — new `renewSubscription` (queue or start), `getRenewalPreview`, `activateUpcomingSubscription(tx, traineeId, now)`, `cancelUpcomingRenewal`.
- `src/schemas/subscription.schema.ts` — `renewSchema` (paymentStatus no longer trusted), `renewPreviewQuerySchema`.
- `src/app/api/subscriptions/renew/route.ts` — GET preview + POST renew.
- `src/app/api/subscriptions/[id]/route.ts` — DELETE (cancel queued renewal).
- `src/lib/auth/access.ts` — `cancelRenewal` (admin only).
- `src/services/attendance.service.ts` — ignore UPCOMING; activate renewal when sessions run out; no revival when a renewal already took over.
- `src/services/group.service.ts` — `releaseLapsedSeats` ignores UPCOMING, never releases a trainee with a queued renewal.
- `src/jobs/subscription-expiry.job.ts` — activate due renewals after expiring.
- `src/jobs/archive-records.job.ts` — copy `group_id` if it copies columns explicitly.
- `src/services/trainee.service.ts` — trainee detail returns `upcomingSubscription` and `lastSubscription`.
- `src/services/dashboard.service.ts` — expiring list: `traineeId`, `renewed`.
- `src/services/portal.service.ts` — current subscription ignores UPCOMING (+ show the queued one).
- `src/services/report.service.ts` — check status handling (UPCOMING is its own status).

Frontend
- `src/components/subscriptions/renew-dialog.tsx` (new) — the popup.
- `src/app/[locale]/(dashboard)/trainees/[id]/page.tsx` — Renew button + banner + queued-renewal card + `?renew=1`.
- `src/app/[locale]/(dashboard)/dashboard/page.tsx` — Renew link → trainee page; "Renewed ✓".
- `src/messages/en.json`, `src/messages/ar.json` — new strings.

Tests
- `src/lib/utils/renewal.test.ts` — unit.
- `tests/integration/subscription-renewal.test.ts` — integration on real Postgres.
- Update `tests/integration/subscription-integrity.test.ts`, `tests/integration/group-membership.test.ts` (old "renew closes current now" assumption).
- `e2e/renewal.spec.ts`, `playwright.config.ts`, `e2e/global-setup.ts` — Playwright end-to-end; `package.json` script `test:e2e`; CI step in `.github/workflows/ci.yml`.

## Progress

- [x] Plan written
- [x] Local env (Postgres, .env, npm ci, platform migrations)
- [x] Database: schema + migrations
- [x] Renewal maths + unit tests
- [x] Service + API + access key (`getRenewalPreview`, `renewSubscription`, `activateUpcomingSubscription`,
      `activateDueRenewals`, `cancelUpcomingRenewal`; GET/POST `/api/subscriptions/renew`, DELETE `/api/subscriptions/[id]`)
- [x] Callers ignore UPCOMING (attendance + correction fallback to previous sub + retake guard, seats, expiry job,
      archive, portal schedule, reports expiring/renewal counts, trainee detail `lastSubscription`/`upcomingSubscription`,
      dashboard `traineeId`/`renewed`)
- [x] Integration tests (new `subscription-renewal.test.ts` 26 tests; updated integrity, group-membership, moderator-permissions)
- [x] Frontend: `renew-dialog.tsx`, trainee page (banner, queued card, Renew, `?renew=1` via useSearchParams), dashboard link + "Renewed", `renewal` namespace in en/ar
- [x] Playwright e2e + CI (`@playwright/test` 1.56.1 = /opt/pw-browsers; `npm run test:e2e`; e2e/ global setup provisions a test academy)
- [x] Full test run (jest 338, isolation 9, e2e 2 on the production build), typecheck, build; commit + push

## Local environment (container resets lose it)

```bash
pg_ctlcluster 16 main start
su postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\" -c 'CREATE DATABASE yalla;'"
# .env (gitignored): DATABASE_URL / DIRECT_DATABASE_URL = postgresql://postgres:postgres@localhost:5432/yalla
#   JWT_ACCESS_SECRET / JWT_REFRESH_SECRET = 32+ chars, NEXT_PUBLIC_ROOT_DOMAIN=localhost, RUN_SCHEDULER=false
npm ci && npx prisma migrate deploy --schema=prisma/platform/schema.prisma
```
