/**
 * Login index
 *
 * `user_phone_index` (platform schema) maps a phone number to the academy
 * account it signs in to. Login reads only this table to find candidates, then
 * checks the password in that academy's own schema. It is a copy of tenant
 * data, and this module is the only thing that writes it.
 *
 * ⚠️ WHY IT EXISTS (hardening plan §26). The index used to be written by hand
 * from 11 places across 4 services, each after its tenant transaction had
 * already committed:
 *   - creating a user with the same phone in a second branch upserted the
 *     index, re-pointing the first user's login at the second: user one, with
 *     their own correct password, got 401, and nothing reported an error;
 *   - when the index write failed after the commit, the account existed but
 *     could never sign in, and a retry skipped the write;
 *   - reactivating a user never re-added their entry, and changing a parent's
 *     phone never updated it, so they could only sign in with the old number.
 *
 * Two changes close all of it:
 *   1. Every write runs in the SAME transaction as the tenant change it mirrors.
 *      The platform and tenant schemas live in one Postgres database, so a
 *      schema-qualified statement commits or rolls back with the tenant write:
 *      there is no window in which an account exists without its login.
 *   2. The entry is DERIVED from the account's current state (`syncLoginIndex`
 *      reads the user and makes the index match), never patched by callers, so
 *      no caller can get it wrong. Call it after any change to a user's phone,
 *      active flag, branch or role.
 *
 * The index can only point a phone at one account per academy because the
 * tenant side now enforces the same rule: the partial unique index
 * `users_one_active_account_per_phone` allows one ACTIVE account per phone per
 * academy, matching the index's own unique (phone_number, tenant_id).
 */

import { randomUUID } from 'node:crypto';
import { Prisma, type TransactionClient } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { ConflictError } from '@/lib/api/error-handler';

// ─── The platform table, schema-qualified ────────────────────

/**
 * `"<platform schema>"."user_phone_index"`, for raw SQL run inside a tenant
 * transaction, where the search_path points at the academy's schema.
 *
 * The platform client connects with DATABASE_URL as-is, so its schema is the
 * URL's `schema` parameter or Postgres's default, `public`.
 */
function loginIndexTable(): Prisma.Sql {
  const url = process.env.DATABASE_URL;
  const schema = (url && new URL(url).searchParams.get('schema')) || 'public';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) {
    throw new Error(`Refusing to use platform schema name "${schema}" in SQL`);
  }
  return Prisma.raw(`"${schema}"."user_phone_index"`);
}

// ─── Keeping one account's entry in step ─────────────────────

/**
 * Make the login index match one account's current state, inside the caller's
 * tenant transaction.
 *
 *   - active account → exactly one entry: its phone → this account;
 *   - inactive or missing account → no entry.
 *
 * Idempotent: calling it when nothing changed is a no-op in effect, so callers
 * need not work out what changed.
 */
export async function syncLoginIndex(
  tx: TransactionClient,
  tenantId: string,
  userId: string
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { phoneNumber: true, isActive: true, branchId: true, role: true },
  });
  const table = loginIndexTable();

  // Remove this account's entries that no longer describe it: all of them if
  // it is inactive or gone, otherwise any under an old phone number.
  if (!user || !user.isActive) {
    await tx.$executeRaw`
      DELETE FROM ${table}
      WHERE "tenant_id" = ${tenantId}::uuid AND "user_id" = ${userId}::uuid
    `;
    return;
  }

  await tx.$executeRaw`
    DELETE FROM ${table}
    WHERE "tenant_id" = ${tenantId}::uuid
      AND "user_id" = ${userId}::uuid
      AND "phone_number" <> ${user.phoneNumber}
  `;

  // One entry per phone per academy. A conflicting entry for another account is
  // stale by construction: the tenant's partial unique index means no OTHER
  // active account in this academy can hold this number, so the phone now
  // belongs to this one.
  await tx.$executeRaw`
    INSERT INTO ${table}
      ("id", "phone_number", "tenant_id", "user_id", "branch_id", "role", "created_at")
    VALUES
      (${randomUUID()}::uuid, ${user.phoneNumber}, ${tenantId}::uuid, ${userId}::uuid,
       ${user.branchId}::uuid, ${user.role}, NOW())
    ON CONFLICT ("phone_number", "tenant_id") DO UPDATE
      SET "user_id" = EXCLUDED."user_id",
          "branch_id" = EXCLUDED."branch_id",
          "role" = EXCLUDED."role"
  `;
}

/**
 * Remove every login of an academy, for a DELETED tenant. Platform-level: the
 * academy's schema is being dropped, so there is no tenant transaction to join.
 */
export async function removeTenantFromLoginIndex(tenantId: string): Promise<void> {
  await platformPrisma.userPhoneIndex.deleteMany({ where: { tenantId } });
}

// ─── Phone conflicts ─────────────────────────────────────────

/**
 * The account, if any, that already signs in with `phoneNumber` in this
 * academy (the caller's tenant transaction). `excludeUserId` skips the account
 * being edited.
 */
export async function findActiveAccountByPhone(
  tx: TransactionClient,
  phoneNumber: string,
  excludeUserId?: string
) {
  return tx.user.findFirst({
    where: {
      phoneNumber,
      isActive: true,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true, branchId: true, role: true, name: true, phoneNumber: true },
  });
}

/**
 * The clear error for a phone number another active account already uses.
 * Names the branch only when it is the caller's own: a branch-scoped moderator
 * has no business learning who holds a number elsewhere.
 */
export function phoneInUseError(holder: { branchId: string }, branchId: string): ConflictError {
  return new ConflictError(
    holder.branchId === branchId
      ? 'This phone number is already registered to an active account in this branch.'
      : 'This phone number is already used by an active account in another branch. ' +
          'A phone number can sign in to only one account per academy.'
  );
}

/** Throw the clear conflict if another active account already uses this phone. */
export async function assertPhoneAvailable(
  tx: TransactionClient,
  phoneNumber: string,
  branchId: string,
  excludeUserId?: string
): Promise<void> {
  const holder = await findActiveAccountByPhone(tx, phoneNumber, excludeUserId);
  if (holder) throw phoneInUseError(holder, branchId);
}

/**
 * True when an error is `users_one_active_account_per_phone` rejecting a write:
 * a concurrent request took the number after this one had checked it.
 * Duck-typed on the Prisma code, since tenant and platform clients each ship
 * their own error classes.
 */
export function isActivePhoneTaken(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { code, meta } = err as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return false;
  const target = JSON.stringify(meta?.target ?? '');
  return target.includes('phone_number') || target.includes('one_active_account_per_phone');
}

/**
 * Run a write that may claim a phone number, translating the database's
 * one-active-account rule into the same clear 409 the pre-check gives. The
 * pre-check is for the message; this rule is the guarantee.
 */
export async function withPhoneGuard<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isActivePhoneTaken(err)) {
      throw new ConflictError(
        'This phone number was just registered to another active account in this academy. ' +
          'A phone number can sign in to only one account per academy.'
      );
    }
    throw err;
  }
}

// ─── Reconciliation ──────────────────────────────────────────

export interface LoginIndexReport {
  tenantId: string;
  /** Active accounts with no entry, or whose entry points elsewhere. */
  missing: string[];
  /** Entries for an account that is inactive, gone, or has another phone now. */
  stale: string[];
  /** Entries pointing at the right account but with the wrong branch or role. */
  outdated: string[];
  repaired: boolean;
}

/**
 * Compare an academy's active accounts with its login entries, and optionally
 * rebuild the entries from the accounts.
 *
 * A safety net and an audit tool: with every write going through
 * syncLoginIndex this should always come back clean. Reports user ids only,
 * never phone numbers.
 */
export async function reconcileLoginIndex(
  tx: TransactionClient,
  tenantId: string,
  options: { repair?: boolean } = {}
): Promise<LoginIndexReport> {
  const table = loginIndexTable();

  const accounts = await tx.user.findMany({
    where: { isActive: true },
    select: { id: true, phoneNumber: true, branchId: true, role: true },
  });
  const entries = await tx.$queryRaw<
    { phone_number: string; user_id: string; branch_id: string; role: string }[]
  >`
    SELECT "phone_number", "user_id"::text AS "user_id", "branch_id"::text AS "branch_id", "role"
    FROM ${table}
    WHERE "tenant_id" = ${tenantId}::uuid
  `;

  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const entryByPhone = new Map(entries.map((e) => [e.phone_number, e]));

  const missing = accounts
    .filter((a) => entryByPhone.get(a.phoneNumber)?.user_id !== a.id)
    .map((a) => a.id);
  const stale = entries
    .filter((e) => accountById.get(e.user_id)?.phoneNumber !== e.phone_number)
    .map((e) => e.user_id);
  const outdated = entries
    .filter((e) => {
      const account = accountById.get(e.user_id);
      return (
        account?.phoneNumber === e.phone_number &&
        (account.branchId !== e.branch_id || account.role !== e.role)
      );
    })
    .map((e) => e.user_id);

  const clean = missing.length === 0 && stale.length === 0 && outdated.length === 0;
  if (options.repair && !clean) {
    // Rebuild from the source of truth in two statements: drop every entry that
    // does not describe an active account, then write one per active account.
    await tx.$executeRaw`
      DELETE FROM ${table} i
      WHERE i."tenant_id" = ${tenantId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM "users" u
          WHERE u."id" = i."user_id" AND u."is_active" AND u."phone_number" = i."phone_number"
        )
    `;
    await tx.$executeRaw`
      INSERT INTO ${table}
        ("id", "phone_number", "tenant_id", "user_id", "branch_id", "role", "created_at")
      SELECT gen_random_uuid(), u."phone_number", ${tenantId}::uuid, u."id", u."branch_id",
             u."role"::text, NOW()
      FROM "users" u
      WHERE u."is_active"
      ON CONFLICT ("phone_number", "tenant_id") DO UPDATE
        SET "user_id" = EXCLUDED."user_id",
            "branch_id" = EXCLUDED."branch_id",
            "role" = EXCLUDED."role"
    `;
  }

  return { tenantId, missing, stale, outdated, repaired: Boolean(options.repair && !clean) };
}
