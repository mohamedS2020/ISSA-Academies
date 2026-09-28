/**
 * Receipt numbers and trainee codes under concurrency — hardening plan §25.
 *
 * Both used to be "read the branch's highest value, add one". Concurrent
 * requests read the same value and all but one failed on the unique constraint:
 * six simultaneous enrollments in one branch, FOUR failed. They now come from an
 * atomic per-branch counter, so every concurrent request should succeed with a
 * distinct, gap-free number.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { enrollTrainee } from '@/services/subscription.service';
import { createTrainee } from '@/services/trainee.service';
import { withTenantContext } from '@/lib/db/tenant-client';
import { platformPrisma } from '@/lib/db/platform-client';
import {
  provisionTestAcademy,
  destroyTestAcademy,
  createTestGroup,
  createTestTrainee,
  type TestAcademy,
} from '../helpers/test-academy';

let academy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('seq');
}, 120_000);

afterAll(async () => {
  try {
    await destroyTestAcademy(academy);
  } finally {
    await platformPrisma.$disconnect();
  }
});

const branchCode = (a: TestAcademy) =>
  withTenantContext(a.tenantId, async (tx) =>
    (await tx.branch.findUniqueOrThrow({ where: { id: a.branchId }, select: { code: true } })).code
  );

let phoneN = 0;
const traineeInput = () => {
  const n = ++phoneN;
  const phone = `+2019${String(Date.now()).slice(-6)}${String(n).padStart(3, '0')}`;
  return {
    name: `Registrant ${n}`,
    dateOfBirth: '2014-05-05',
    phoneNumber: phone,
    whatsappNumber: phone,
    parentIdCard: '29901011234567',
    medicalCondition: 'None',
    referralType: 'NEW' as const,
    guardianName: `Guardian ${n}`,
  };
};

describe('receipt numbers', () => {
  test('simultaneous enrollments in one branch all succeed with distinct numbers', async () => {
    const a = academy!;
    const group = await createTestGroup(a);
    const trainees = await Promise.all(Array.from({ length: 6 }, () => createTestTrainee(a)));

    const outcomes = await Promise.allSettled(
      trainees.map((t) =>
        enrollTrainee(a.tenantId, a.branchId, a.adminId, {
          traineeId: t.id,
          planId: a.planId,
          levelId: a.levelId,
          groupId: group.id,
          amountPaid: 500,
          paymentStatus: 'PAID',
          paymentMethod: 'CASH',
        })
      )
    );

    // Before the counter: 4 of these 6 failed on a duplicate receipt number.
    const failures = outcomes.filter((o) => o.status === 'rejected');
    expect(failures).toHaveLength(0);

    const numbers = outcomes.map(
      (o) => (o as PromiseFulfilledResult<{ receipt: { receiptNumber: string } }>).value.receipt.receiptNumber
    );
    expect(new Set(numbers).size).toBe(6);
  }, 90_000);

  test('the sequence is contiguous — no gaps, no repeats', async () => {
    const a = academy!;
    const seqs = await withTenantContext(a.tenantId, (tx) =>
      tx.receipt.findMany({ where: { branchId: a.branchId }, select: { seq: true }, orderBy: { seq: 'asc' } })
    );
    const values = seqs.map((s) => s.seq);
    expect(values).toEqual(Array.from({ length: values.length }, (_, i) => i + 1));
  }, 60_000);

  test('the database rejects a duplicate sequence number in a branch', async () => {
    const a = academy!;
    const existing = await withTenantContext(a.tenantId, (tx) =>
      tx.receipt.findFirstOrThrow({ where: { branchId: a.branchId } })
    );

    await expect(
      withTenantContext(a.tenantId, (tx) =>
        tx.receipt.create({
          data: {
            branchId: a.branchId,
            traineeId: existing.traineeId,
            subscriptionId: existing.subscriptionId,
            receiptNumber: `DIFFERENT-NUMBER-${Date.now()}`,
            seq: existing.seq, // same sequence, different formatted number
            amount: 1,
          },
        })
      )
    ).rejects.toThrow();
  }, 60_000);
});

describe('trainee codes', () => {
  test('simultaneous registrations all succeed with distinct codes', async () => {
    const a = academy!;
    const outcomes = await Promise.allSettled(
      Array.from({ length: 5 }, () => createTrainee(a.tenantId, a.branchId, traineeInput(), a.adminId))
    );

    expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(0);

    const codes = outcomes.map(
      (o) => (o as PromiseFulfilledResult<{ trainee: { systemCode: string } }>).value.trainee.systemCode
    );
    expect(new Set(codes).size).toBe(5);
  }, 90_000);

  test('codes carry the branch code and no platform prefix', async () => {
    const a = academy!;
    const code = await branchCode(a);
    const { trainee } = await createTrainee(a.tenantId, a.branchId, traineeInput(), a.adminId);

    expect(trainee.systemCode).toMatch(new RegExp(`^${code}-\\d{6}$`));
    expect(trainee.systemCode).not.toMatch(/ISSA/i);
  }, 60_000);

  test('renaming the branch to an earlier-sorting code does not break registration', async () => {
    const a = academy!;
    const before = await createTrainee(a.tenantId, a.branchId, traineeInput(), a.adminId);
    const beforeSeq = Number(before.trainee.systemCode.split('-').pop());

    // "AAA…" sorts before the fixture's "M…" code. The old generator found the
    // "last" code by string sort, so after this rename it kept reading an old
    // code, kept producing the same next number, and every registration in the
    // branch collided from then on.
    const renamed = `AAA${Date.now().toString(36)}`.slice(0, 20).toUpperCase();
    await withTenantContext(a.tenantId, (tx) =>
      tx.branch.update({ where: { id: a.branchId }, data: { code: renamed } })
    );

    const first = await createTrainee(a.tenantId, a.branchId, traineeInput(), a.adminId);
    const second = await createTrainee(a.tenantId, a.branchId, traineeInput(), a.adminId);

    expect(first.trainee.systemCode).toBe(`${renamed}-${String(beforeSeq + 1).padStart(6, '0')}`);
    expect(second.trainee.systemCode).toBe(`${renamed}-${String(beforeSeq + 2).padStart(6, '0')}`);
  }, 90_000);
});
