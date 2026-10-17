/**
 * Siblings share one guardian account; each keeps its own status.
 *
 * A trainee's status used to BE its account's status. Deactivating one child
 * deactivated the account, so every brother and sister showed as inactive and
 * the parent's portal login was removed. Each trainee now has its own flag, and
 * the account (and its login) stays active while any of its trainees is.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import {
  createTrainee,
  deactivateTrainee,
  activateTrainee,
  listTrainees,
} from '@/services/trainee.service';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import { normalizePhone } from '@/lib/phone';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;
let secondBranchId = '';

beforeAll(async () => {
  academy = await provisionTestAcademy('siblings');
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
function freshPhone(): string {
  const n = ++phoneCounter;
  return normalizePhone(`011${String(Date.now()).slice(-6)}${String(n).padStart(2, '0')}`);
}

type TraineeInput = Parameters<typeof createTrainee>[2];
const child = (name: string, phoneNumber: string): TraineeInput =>
  ({
    name,
    guardianName: 'Parent',
    isSelfAccount: false,
    dateOfBirth: '2015-01-01',
    phoneNumber,
    whatsappNumber: phoneNumber,
    parentIdCard: '0',
    medicalCondition: 'none',
  }) as TraineeInput;

async function state(traineeIds: string[]) {
  return withTenantContext(academy!.tenantId, async (tx) => {
    const trainees = await tx.traineeProfile.findMany({
      where: { id: { in: traineeIds } },
      select: { id: true, isActive: true, user: { select: { id: true, isActive: true } } },
    });
    const byId = new Map(trainees.map((t) => [t.id, t]));
    return traineeIds.map((id) => byId.get(id)!);
  });
}

async function hasLogin(accountId: string): Promise<boolean> {
  const count = await platformPrisma.userPhoneIndex.count({
    where: { tenantId: academy!.tenantId, userId: accountId },
  });
  return count === 1;
}

describe('siblings on one guardian account', () => {
  test('a second child joins the existing account and keeps its login', async () => {
    const a = academy!;
    const phone = freshPhone();
    const first = await createTrainee(a.tenantId, a.branchId, child('First', phone), a.adminId);
    const second = await createTrainee(a.tenantId, a.branchId, child('Second', phone), a.adminId);

    expect(first.portalPassword).toBeTruthy();
    expect(second.portalPassword).toBeNull(); // linked: the account keeps its password
    const [one, two] = await state([first.trainee.id, second.trainee.id]);
    expect(two.user.id).toBe(one.user.id);
  }, 60_000);

  test('deactivating one child leaves the siblings and the parent login alone', async () => {
    const a = academy!;
    const phone = freshPhone();
    const first = await createTrainee(a.tenantId, a.branchId, child('First', phone), a.adminId);
    const second = await createTrainee(a.tenantId, a.branchId, child('Second', phone), a.adminId);

    const result = await deactivateTrainee(a.tenantId, a.branchId, first.trainee.id, a.adminId);
    expect(result.accountDeactivated).toBe(false);

    const [one, two] = await state([first.trainee.id, second.trainee.id]);
    expect(one.isActive).toBe(false);
    // Both of these used to flip with the first child.
    expect(two.isActive).toBe(true);
    expect(two.user.isActive).toBe(true);
    expect(await hasLogin(two.user.id)).toBe(true);
  }, 60_000);

  test('the account and its login go only when the last child does', async () => {
    const a = academy!;
    const phone = freshPhone();
    const first = await createTrainee(a.tenantId, a.branchId, child('First', phone), a.adminId);
    const second = await createTrainee(a.tenantId, a.branchId, child('Second', phone), a.adminId);

    await deactivateTrainee(a.tenantId, a.branchId, first.trainee.id, a.adminId);
    const last = await deactivateTrainee(a.tenantId, a.branchId, second.trainee.id, a.adminId);
    expect(last.accountDeactivated).toBe(true);

    const [, two] = await state([first.trainee.id, second.trainee.id]);
    expect(two.user.isActive).toBe(false);
    expect(await hasLogin(two.user.id)).toBe(false);

    // Reactivating one child brings the account and its login back, and only
    // that child: the other stays inactive.
    const back = await activateTrainee(a.tenantId, a.branchId, first.trainee.id, a.adminId);
    expect(back.accountReactivated).toBe(true);
    const [oneAgain, twoAgain] = await state([first.trainee.id, second.trainee.id]);
    expect(oneAgain.isActive).toBe(true);
    expect(twoAgain.isActive).toBe(false);
    expect(await hasLogin(oneAgain.user.id)).toBe(true);
  }, 60_000);

  test('a returning family gets its own account back, not a new one', async () => {
    const a = academy!;
    const phone = freshPhone();
    const old = await createTrainee(a.tenantId, a.branchId, child('Old', phone), a.adminId);
    await deactivateTrainee(a.tenantId, a.branchId, old.trainee.id, a.adminId);

    // Used to link the new child to the deactivated account: inactive at birth,
    // and no login.
    const fresh = await createTrainee(a.tenantId, a.branchId, child('New', phone), a.adminId);
    expect(fresh.portalPassword).toBeNull();

    const [oldState, freshState] = await state([old.trainee.id, fresh.trainee.id]);
    expect(freshState.user.id).toBe(oldState.user.id);
    expect(freshState.isActive).toBe(true);
    expect(freshState.user.isActive).toBe(true);
    expect(oldState.isActive).toBe(false);
    expect(await hasLogin(freshState.user.id)).toBe(true);
  }, 60_000);

  test('a guardian account in another branch cannot take a trainee here', async () => {
    const a = academy!;
    const phone = freshPhone();
    await createTrainee(a.tenantId, secondBranchId, child('Elsewhere', phone), a.adminId);

    await expect(
      createTrainee(a.tenantId, a.branchId, child('Here', phone), a.adminId)
    ).rejects.toMatchObject({ statusCode: 409 });
  }, 60_000);

  test('the list filters on the trainee\'s own status, and finds a child by name', async () => {
    const a = academy!;
    const phone = freshPhone();
    const tag = `Zz${Date.now().toString(36)}`;
    const gone = await createTrainee(a.tenantId, a.branchId, child(`${tag} Gone`, phone), a.adminId);
    const here = await createTrainee(a.tenantId, a.branchId, child(`${tag} Here`, phone), a.adminId);
    await deactivateTrainee(a.tenantId, a.branchId, gone.trainee.id, a.adminId);

    const active = await listTrainees(a.tenantId, a.branchId, {
      page: 1,
      limit: 50,
      search: tag,
      isActive: true,
    });
    expect(active.trainees.map((t) => t.id)).toEqual([here.trainee.id]);

    const inactive = await listTrainees(a.tenantId, a.branchId, {
      page: 1,
      limit: 50,
      search: tag,
      isActive: false,
    });
    expect(inactive.trainees.map((t) => t.id)).toEqual([gone.trainee.id]);
  }, 60_000);
});
