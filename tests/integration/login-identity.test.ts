/**
 * One phone number, one login, per academy — hardening plan §26.
 *
 * Before: the tenant table allowed one phone per BRANCH, the login index one per
 * ACADEMY. A second user with the same phone in another branch was accepted,
 * and the index was re-pointed at them: user one, with their own correct
 * password, got 401. Index writes also ran after the tenant transaction, so a
 * failure left an account that could never sign in, and reactivating a user or
 * changing a parent's phone never updated the index at all.
 *
 * These tests sign in through the real login route wherever the claim is about
 * signing in, and check the index itself where the claim is about the index.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { createUser, updateUser, deactivateUser } from '@/services/user.service';
import { createTrainee, updateTrainee } from '@/services/trainee.service';
import { reconcileLoginIndex } from '@/services/login-index';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { hashPassword } from '@/lib/auth/password';
import { normalizePhone } from '@/lib/phone';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;
let secondBranchId = '';

const PASSWORD = 'Test-Password-123';

beforeAll(async () => {
  academy = await provisionTestAcademy('loginid');
  secondBranchId = await withTenantContext(academy.tenantId, async (tx) => {
    const branch = await tx.branch.create({
      data: { name: 'Second', code: `S${Date.now().toString(36)}`.toUpperCase().slice(0, 20) },
      select: { id: true },
    });
    return branch.id;
  });
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

let phoneCounter = 0;
/** A fresh Egyptian mobile in national form, e.g. 0101234 5678. */
function freshPhone(): string {
  const n = ++phoneCounter;
  return `010${String(Date.now()).slice(-6)}${String(n).padStart(2, '0')}`;
}

async function signIn(phoneNumber: string, password: string): Promise<number> {
  const res = await loginRoute(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneNumber, password }),
    })
  );
  return res.status;
}

/** Which user the login index sends this phone to, in this academy. */
async function indexedUser(phone: string): Promise<string | null> {
  const row = await platformPrisma.userPhoneIndex.findFirst({
    where: { tenantId: academy!.tenantId, phoneNumber: normalizePhone(phone) },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

const moderator = (phoneNumber: string) => ({
  name: 'Mod',
  phoneNumber: normalizePhone(phoneNumber),
  password: PASSWORD,
  role: 'MODERATOR' as const,
  privileges: [],
  language: 'en' as const,
});

describe('a phone number signs in to one account per academy', () => {
  test('a second branch cannot take over the first account\'s login', async () => {
    const a = academy!;
    const phone = freshPhone();
    const first = await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);

    // This used to succeed and silently re-point the login at the new user.
    await expect(
      createUser(a.tenantId, secondBranchId, moderator(phone), a.adminId)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(await indexedUser(phone)).toBe(first.id);
    expect(await signIn(phone, PASSWORD)).toBe(200);
  }, 60_000);

  test('every spelling of a number is the same number', async () => {
    const a = academy!;
    const national = freshPhone(); // 010…
    const international = `+20 ${national.slice(1, 4)} ${national.slice(4)}`;
    await createUser(a.tenantId, a.branchId, moderator(national), a.adminId);

    await expect(
      createUser(a.tenantId, secondBranchId, moderator(international), a.adminId)
    ).rejects.toMatchObject({ statusCode: 409 });

    // And the person can sign in typing either form, or in Arabic digits.
    const arabic = national.replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
    expect(await signIn(international, PASSWORD)).toBe(200);
    expect(await signIn(arabic, PASSWORD)).toBe(200);
  }, 60_000);

  test('the database refuses a second active account even when the service is bypassed', async () => {
    const a = academy!;
    const phone = normalizePhone(freshPhone());
    await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);

    await expect(
      withTenantContext(a.tenantId, async (tx) =>
        tx.user.create({
          data: {
            branchId: secondBranchId,
            name: 'Bypass',
            phoneNumber: phone,
            passwordHash: await hashPassword(PASSWORD),
            role: 'MODERATOR',
          },
        })
      )
    ).rejects.toThrow();
  }, 60_000);

  test('a deactivated account\'s number can be given to a new account', async () => {
    const a = academy!;
    const phone = freshPhone();
    const old = await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);
    await deactivateUser(a.tenantId, a.branchId, old.id, a.adminId);
    expect(await indexedUser(phone)).toBeNull();

    // Same branch even: inactive accounts are history and do not hold the number.
    const fresh = await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);
    expect(await indexedUser(phone)).toBe(fresh.id);
    expect(await signIn(phone, PASSWORD)).toBe(200);
  }, 60_000);
});

describe('the login follows every change to the account', () => {
  test('reactivating a user restores their login', async () => {
    const a = academy!;
    const phone = freshPhone();
    const user = await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);

    await deactivateUser(a.tenantId, a.branchId, user.id, a.adminId);
    expect(await signIn(phone, PASSWORD)).toBe(401);

    // Reactivation never re-added the index entry: they stayed locked out.
    await updateUser(a.tenantId, a.branchId, user.id, { isActive: true }, a.adminId);
    expect(await indexedUser(phone)).toBe(user.id);
    expect(await signIn(phone, PASSWORD)).toBe(200);
  }, 60_000);

  test('reactivation is refused once the number signs in to someone else', async () => {
    const a = academy!;
    const phone = freshPhone();
    const old = await createUser(a.tenantId, a.branchId, moderator(phone), a.adminId);
    await deactivateUser(a.tenantId, a.branchId, old.id, a.adminId);
    const holder = await createUser(a.tenantId, secondBranchId, moderator(phone), a.adminId);

    await expect(
      updateUser(a.tenantId, a.branchId, old.id, { isActive: true }, a.adminId)
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(await indexedUser(phone)).toBe(holder.id);
  }, 60_000);

  test('a refused phone change leaves both the account and its login untouched', async () => {
    const a = academy!;
    const mine = freshPhone();
    const theirs = freshPhone();
    const user = await createUser(a.tenantId, a.branchId, moderator(mine), a.adminId);
    await createUser(a.tenantId, secondBranchId, moderator(theirs), a.adminId);

    await expect(
      updateUser(
        a.tenantId, a.branchId, user.id, { phoneNumber: normalizePhone(theirs) }, a.adminId
      )
    ).rejects.toMatchObject({ statusCode: 409 });

    const stored = await withTenantContext(a.tenantId, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { phoneNumber: true } })
    );
    expect(stored.phoneNumber).toBe(normalizePhone(mine));
    expect(await signIn(mine, PASSWORD)).toBe(200);
  }, 60_000);

  test('changing a parent\'s phone moves their login to the new number', async () => {
    const a = academy!;
    const oldPhone = freshPhone();
    const newPhone = freshPhone();
    const { trainee, portalPassword } = await createTrainee(
      a.tenantId,
      a.branchId,
      {
        name: 'Child',
        guardianName: 'Parent',
        isSelfAccount: false,
        dateOfBirth: '2015-01-01',
        phoneNumber: normalizePhone(oldPhone),
        whatsappNumber: normalizePhone(oldPhone),
        parentIdCard: '0',
        medicalCondition: 'none',
      } as Parameters<typeof createTrainee>[2],
      a.adminId
    );
    expect(portalPassword).toBeTruthy();

    await updateTrainee(
      a.tenantId, a.branchId, trainee.id, { phoneNumber: normalizePhone(newPhone) }, a.adminId
    );

    // The index kept the old number: the parent could sign in only with the
    // number they had just replaced.
    expect(await signIn(newPhone, portalPassword!)).toBe(200);
    expect(await signIn(oldPhone, portalPassword!)).toBe(401);
  }, 60_000);
});

describe('reconcileLoginIndex', () => {
  test('finds drift, repairs it, and comes back clean', async () => {
    const a = academy!;
    const report = (repair = false) =>
      withTenantContext(a.tenantId, (tx) => reconcileLoginIndex(tx, a.tenantId, { repair }));

    // Everything above went through syncLoginIndex.
    expect(await report()).toMatchObject({ missing: [], stale: [], outdated: [] });

    // Drift the index by hand: lose one entry, add one for nobody.
    const victim = await createUser(a.tenantId, a.branchId, moderator(freshPhone()), a.adminId);
    await platformPrisma.userPhoneIndex.deleteMany({
      where: { tenantId: a.tenantId, userId: victim.id },
    });
    const ghost = '00000000-0000-4000-8000-000000000001';
    await platformPrisma.userPhoneIndex.create({
      data: {
        tenantId: a.tenantId,
        userId: ghost,
        branchId: a.branchId,
        phoneNumber: normalizePhone(freshPhone()),
        role: 'MODERATOR',
      },
    });

    const drifted = await report(true);
    expect(drifted.missing).toEqual([victim.id]);
    expect(drifted.stale).toEqual([ghost]);
    expect(drifted.repaired).toBe(true);

    expect(await report()).toMatchObject({ missing: [], stale: [], outdated: [] });
  }, 60_000);
});
