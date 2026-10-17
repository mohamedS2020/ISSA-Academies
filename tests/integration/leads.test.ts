/**
 * Marketing leads and platform settings, against the real platform schema.
 *
 * Every lead created here carries a unique marker in its academy name and is
 * deleted afterwards; the notification-email setting is restored to whatever
 * it was before the run.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { platformPrisma } from '@/lib/db/platform-client';
import {
  createLead,
  deleteLead,
  getPlatformSettings,
  listLeads,
  updateLead,
  updatePlatformSettings,
} from '@/services/lead.service';
import { demoRequestSchema } from '@/schemas/lead.schema';
import { generateAccessToken } from '@/lib/auth/jwt';
import { UserRole } from '@/types';
import { GET as listRoute } from '@/app/api/superadmin/leads/route';
import { DELETE as deleteRoute, PATCH as patchRoute } from '@/app/api/superadmin/leads/[id]/route';
import { GET as getSettingsRoute } from '@/app/api/superadmin/settings/route';

const MARKER = `qa-leads-${Date.now()}`;
const env = process.env as Record<string, string | undefined>;
env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-at-least-32-characters';

let originalEmail = '';

beforeAll(async () => {
  originalEmail = (await getPlatformSettings()).leadNotificationEmail;
});

afterAll(async () => {
  await platformPrisma.marketingLead.deleteMany({ where: { academyName: { startsWith: MARKER } } });
  await updatePlatformSettings({ leadNotificationEmail: originalEmail });
  await platformPrisma.$disconnect();
});

function newLead(suffix: string, phone = '+20 100 123 4567') {
  return createLead(
    demoRequestSchema.parse({
      name: `Tester ${suffix}`,
      academy: `${MARKER} ${suffix}`,
      phone,
      branches: '2-5',
      sport: 'tennis',
      locale: 'en',
    })
  );
}

describe('lead service', () => {
  it('saves a lead as NEW with a normalized phone', async () => {
    const lead = await newLead('a', '٠١٠ ٠٠١٢ ٣٤٥٦');
    expect(lead.status).toBe('NEW');
    // Arabic digits, spaces and the national form all normalized: stored with the
    // country code, so the WhatsApp link (wa.me/<number>) reaches Egypt.
    expect(lead.phone).toBe('+201000123456');
  });

  it('finds leads by academy, name or phone, and filters by status', async () => {
    const lead = await newLead('b', '+20 111 222 3333');
    const byAcademy = await listLeads({ search: `${MARKER} b`, page: 1, pageSize: 25 });
    expect(byAcademy.items.map((item) => item.id)).toEqual([lead.id]);

    const byPhone = await listLeads({ search: '111 222 3333', page: 1, pageSize: 25 });
    expect(byPhone.items.map((item) => item.id)).toContain(lead.id);

    // Typed the way people say it here: national form, with the leading 0.
    const byNationalPhone = await listLeads({ search: '0111 222', page: 1, pageSize: 25 });
    expect(byNationalPhone.items.map((item) => item.id)).toContain(lead.id);

    await updateLead(lead.id, { status: 'CONTACTED' });
    const contacted = await listLeads({ status: 'CONTACTED', search: MARKER, page: 1, pageSize: 25 });
    expect(contacted.items.map((item) => item.id)).toEqual([lead.id]);
    expect(contacted.counts.CONTACTED).toBeGreaterThanOrEqual(1);
  });

  it('keeps notes, and clears them when emptied', async () => {
    const lead = await newLead('c');
    expect((await updateLead(lead.id, { notes: '  Call back Sunday  ' })).notes).toBe('Call back Sunday');
    expect((await updateLead(lead.id, { notes: '   ' })).notes).toBeNull();
  });

  it('deletes a lead, and says so when it is already gone', async () => {
    const lead = await newLead('d');
    await deleteLead(lead.id);
    await expect(deleteLead(lead.id)).rejects.toThrow('Lead not found');
    await expect(updateLead(lead.id, { status: 'WON' })).rejects.toThrow('Lead not found');
  });
});

describe('platform settings', () => {
  it('stores the notification email, and removes it when emptied', async () => {
    await updatePlatformSettings({ leadNotificationEmail: 'owner@example.com' });
    expect((await getPlatformSettings()).leadNotificationEmail).toBe('owner@example.com');
    await updatePlatformSettings({ leadNotificationEmail: '' });
    expect((await getPlatformSettings()).leadNotificationEmail).toBe('');
  });
});

describe('Super Admin API access', () => {
  const asSuperAdmin = generateAccessToken({ userId: '00000000-0000-4000-8000-000000000001', role: UserRole.SUPER_ADMIN });
  const asAcademyAdmin = generateAccessToken({
    userId: '00000000-0000-4000-8000-000000000002',
    role: UserRole.ADMIN,
    tenantId: '00000000-0000-4000-8000-000000000003',
    branchId: '00000000-0000-4000-8000-000000000004',
  });
  const noParams = { params: Promise.resolve({}) };

  const call = (url: string, token?: string, init: RequestInit = {}) =>
    new Request(`http://localhost${url}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    });

  it('refuses anyone who is not logged in', async () => {
    expect((await listRoute(call('/api/superadmin/leads'), noParams)).status).toBe(401);
    expect((await getSettingsRoute(call('/api/superadmin/settings'), noParams)).status).toBe(401);
  });

  it("refuses an academy's own admin: leads belong to the platform", async () => {
    expect((await listRoute(call('/api/superadmin/leads', asAcademyAdmin), noParams)).status).toBe(403);
    expect((await getSettingsRoute(call('/api/superadmin/settings', asAcademyAdmin), noParams)).status).toBe(403);
  });

  it('lets the Super Admin list, update and delete', async () => {
    const lead = await newLead('api');
    const list = await listRoute(call(`/api/superadmin/leads?search=${encodeURIComponent(`${MARKER} api`)}`, asSuperAdmin), noParams);
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([lead.id]);
    expect(body.pagination).toMatchObject({ page: 1, total: 1 });

    const params = { params: Promise.resolve({ id: lead.id }) };
    const patched = await patchRoute(
      call(`/api/superadmin/leads/${lead.id}`, asSuperAdmin, { method: 'PATCH', body: JSON.stringify({ status: 'DEMO_BOOKED' }) }),
      params
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).data.status).toBe('DEMO_BOOKED');

    const bad = await patchRoute(
      call(`/api/superadmin/leads/${lead.id}`, asSuperAdmin, { method: 'PATCH', body: JSON.stringify({ status: 'MAYBE' }) }),
      params
    );
    expect(bad.status).toBe(422); // the app's status for validation errors

    expect((await deleteRoute(call(`/api/superadmin/leads/${lead.id}`, asSuperAdmin, { method: 'DELETE' }), params)).status).toBe(204);
    expect((await deleteRoute(call(`/api/superadmin/leads/${lead.id}`, asSuperAdmin, { method: 'DELETE' }), params)).status).toBe(404);
  });

  it('rejects an id that is not a UUID', async () => {
    const response = await deleteRoute(
      call('/api/superadmin/leads/not-a-uuid', asSuperAdmin, { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'not-a-uuid' }) }
    );
    expect(response.status).toBe(422);
  });
});
