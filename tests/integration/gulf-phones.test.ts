/**
 * Gulf phone numbers: in a Saudi academy, a parent registered with a local
 * number (05…) is stored internationally (+9665…) and signs in by typing it
 * either way, on the main site where the academy isn't known yet.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { platformPrisma } from '@/lib/db/platform-client';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { createTrainee } from '@/services/trainee.service';
import { createTraineeSchema } from '@/schemas/trainee.schema';
import { academyPhoneCountry, withPhoneCountry } from '@/lib/phone-context';
import { provisionTestAcademy, destroyTestAcademy, type TestAcademy } from '../helpers/test-academy';

let academy: TestAcademy | null = null;

beforeAll(async () => {
  academy = await provisionTestAcademy('gulf');
  await platformPrisma.tenantConfig.update({ where: { tenantId: academy.tenantId }, data: { currency: 'SAR' } });
}, 60_000);

afterAll(async () => {
  await destroyTestAcademy(academy);
}, 60_000);

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

describe('a Saudi academy', () => {
  // A fresh Saudi mobile, written locally: 05 + 8 digits.
  const local = `05${String(Date.now()).slice(-8)}`;
  const international = `+966${local.slice(1)}`;

  test("reads local numbers as Saudi (the academy's currency is SAR)", async () => {
    expect(await academyPhoneCountry(academy!.tenantId)).toBe('SA');
  });

  test('stores a parent registered with a local number internationally, and they sign in either way', async () => {
    // What the trainees API does: the request runs in the academy's country.
    const input = withPhoneCountry('SA', () =>
      createTraineeSchema.parse({
        name: 'Noura Saleh',
        guardianName: 'Saleh Ahmed',
        dateOfBirth: '2015-04-01',
        phoneNumber: local,
        whatsappNumber: local,
        parentIdCard: '1012345678',
        medicalCondition: 'None',
        referralType: 'NEW',
      })
    );
    expect(input.phoneNumber).toBe(international);

    const { trainee, portalPassword } = await createTrainee(academy!.tenantId, academy!.branchId, input, academy!.adminId);
    expect(trainee.user.phoneNumber).toBe(international);
    expect(portalPassword).toBeTruthy();

    // On the main site, typed the local way, with the code, or with spaces.
    expect(await signIn(local, portalPassword!)).toBe(200);
    expect(await signIn(international, portalPassword!)).toBe(200);
    expect(await signIn(`${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`, portalPassword!)).toBe(200);
    expect(await signIn(local, 'wrong-password')).toBe(401);
  }, 60_000);
});
