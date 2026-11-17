/**
 * Provision a disposable academy for the end-to-end specs: an admin with a
 * known password, and two trainees, one whose subscription ends in three days
 * and one whose subscription has ended.
 */

import { writeFileSync } from 'node:fs';
import { loadEnvConfig } from '@next/env';
import {
  provisionTestAcademy,
  createTestGroup,
  createTestTrainee,
  sweepStaleTestAcademies,
} from '../tests/helpers/test-academy';
import { enrollTrainee } from '@/services/subscription.service';
import { withTenantContext } from '@/lib/db/tenant-client';
import { hashPassword } from '@/lib/auth/password';
import { STATE_FILE, type E2EState } from './fixture';

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function globalSetup(): Promise<void> {
  loadEnvConfig(process.cwd());
  await sweepStaleTestAcademies();

  const academy = await provisionTestAcademy('e2e');
  const adminPassword = 'E2e-Password-123!';
  const group = await createTestGroup(academy, { name: 'Dolphins' });

  const enrol = async (name: string) => {
    const trainee = await createTestTrainee(academy);
    await withTenantContext(academy.tenantId, (tx) =>
      tx.traineeProfile.update({ where: { id: trainee.id }, data: { name } })
    );
    const { subscription } = await enrollTrainee(academy.tenantId, academy.branchId, academy.adminId, {
      traineeId: trainee.id,
      planId: academy.planId,
      levelId: academy.levelId,
      groupId: group.id,
      amountPaid: 500,
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
    });
    return { trainee, subscription };
  };

  const expiring = await enrol('Salma Expiring');
  const ended = await enrol('Omar Ended');

  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const adminPhone = await withTenantContext(academy.tenantId, async (tx) => {
    await tx.traineeSubscription.update({
      where: { id: expiring.subscription.id },
      data: { endDate: new Date(utcToday + 3 * DAY_MS) },
    });
    await tx.traineeSubscription.update({
      where: { id: ended.subscription.id },
      data: {
        status: 'EXPIRED',
        endDate: new Date(utcToday - 2 * DAY_MS),
        expiredAt: new Date(utcToday - 2 * DAY_MS),
      },
    });
    const admin = await tx.user.update({
      where: { id: academy.adminId },
      data: { passwordHash: await hashPassword(adminPassword) },
      select: { phoneNumber: true },
    });
    return admin.phoneNumber;
  });
  // The parent's portal login (createTestTrainee's account password).
  const guardian = await withTenantContext(academy.tenantId, (tx) =>
    tx.traineeProfile.findUniqueOrThrow({
      where: { id: expiring.trainee.id },
      select: { user: { select: { phoneNumber: true } } },
    })
  );

  const state: E2EState = {
    tenantId: academy.tenantId,
    schemaName: academy.schemaName,
    adminPhone,
    adminPassword,
    expiring: {
      traineeId: expiring.trainee.id,
      name: 'Salma Expiring',
      guardianPhone: guardian.user.phoneNumber,
      guardianPassword: 'Test-Password-123!',
    },
    ended: { traineeId: ended.trainee.id, name: 'Omar Ended' },
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
