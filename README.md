# ISSA Academies

Multi-tenant SaaS for sports academies. Each academy manages its branches, coaches,
trainees, groups, schedules, attendance, subscriptions, receipts and payroll; parents
get a portal for their trainee's schedule, attendance and receipts.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 6 · PostgreSQL ·
Tailwind 4 · next-intl (English/Arabic with RTL).

---

## Tenant isolation

Every academy gets its **own PostgreSQL schema** (`tenant_<slug>`). Isolation is
enforced at the database level, not by a `WHERE tenant_id = ?` that someone can
forget:

- `withTenantContext(tenantId, cb)` ([src/lib/db/tenant-client.ts](src/lib/db/tenant-client.ts))
  runs the callback inside a transaction that first issues
  `SET LOCAL search_path = "<schema>"`. `SET LOCAL` is scoped to the transaction and
  resets on commit or rollback, so the search path cannot bleed across requests
  sharing a pooled connection.
- Tenant identifiers are sanitised (`sanitizeSchemaName`) and re-validated before they
  can reach a connection string.
- A **pooler in transaction mode is required** for this to hold.

The platform schema (`public`) holds only the academy registry: tenants, their
configs, super admins, and a phone → tenant index for login.

> Authorization always comes from the JWT (`tenantId` / `branchId` claims). The
> academy subdomain is a routing and theming convenience only, and is never trusted
> as a security boundary.

---

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in the values
```

Every variable is documented in [.env.example](.env.example). At minimum you need
`DATABASE_URL`, `DIRECT_DATABASE_URL`, and the two JWT secrets.

Create the platform schema and a super admin to log in with:

```bash
npx prisma migrate deploy --schema=prisma/platform/schema.prisma
npx tsx prisma/seed.ts
```

Then start the dev server and sign in as the super admin to create your first academy:

```bash
npm run dev
```

---

## Migrations

⚠️ **The two schemas have separate migration folders. Never merge them.**

```
prisma/
  platform/schema.prisma + migrations/   ← the public schema (academy registry)
  tenant/schema.prisma   + migrations/   ← one academy's schema, applied per tenant
```

`prisma migrate deploy` applies **every** migration in the folder it is given,
regardless of `--schema`. When both sets shared one folder, provisioning replayed the
platform migrations into every academy schema, and the platform database could not be
built from migrations at all. Prisma derives the folder from the schema file's own
directory, which is what keeps them apart.

```bash
# Change the platform schema
npx prisma migrate dev --schema=prisma/platform/schema.prisma --name <change>

# Change the academy schema — then roll it out to existing academies
npx prisma migrate dev --schema=prisma/tenant/schema.prisma --name <change>
npm run migrate:tenants
```

New academies pick up tenant migrations automatically at provisioning; existing ones
only move when `npm run migrate:tenants` is run. Do not use `prisma db push`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Unit + integration tests (Jest) |
| `npm run test:isolation` | Provisions two real academies, verifies cross-tenant and cross-branch isolation, tears them down |
| `npm run migrate:tenants` | Applies pending tenant migrations to every active academy |
| `npm run lint` | ESLint |

`npm run test:isolation` is the safety-critical suite — it is the check that tenant
isolation actually holds. Keep it green.

---

## Operations

See **[RUNBOOK.md](RUNBOOK.md)** for provisioning an academy, suspending one for
non-payment, rolling migrations, the background-job worker, and restoring from backup.

`GET /api/health` returns 200 when the process is up and can reach the database, 503
when it cannot. Point your platform healthcheck and uptime monitoring at it.

Outstanding pre-launch work is tracked in
**[Pre-Launch Hardening Plan.md](Pre-Launch%20Hardening%20Plan.md)**.
