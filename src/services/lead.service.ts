/**
 * Marketing leads and platform settings.
 *
 * Leads are the landing page's demo requests. They live in the platform schema
 * (not in any academy's), and only the Super Admin can read or change them:
 * they hold a name and a phone number.
 */

import { platformPrisma } from '@/lib/db/platform-client';
import { NotFoundError } from '@/lib/api/error-handler';
import { type DemoRequestInput, type LeadStatus } from '@/schemas/lead.schema';
import { phoneSearchFragment } from '@/lib/phone';

/** Every runtime-editable platform setting, by its storage key. */
export const PLATFORM_SETTING_KEYS = {
  leadNotificationEmail: 'lead_notification_email',
} as const;

export interface PlatformSettings {
  /** Where new-lead notifications go. Empty: no notifications. */
  leadNotificationEmail: string;
}

// ─── Leads ──────────────────────────────────────────────────

export async function createLead(input: DemoRequestInput) {
  return platformPrisma.marketingLead.create({
    data: {
      name: input.name,
      academyName: input.academy,
      phone: input.phone,
      branches: input.branches,
      sport: input.sport,
      locale: input.locale,
    },
  });
}

export async function listLeads(query: {
  status?: LeadStatus;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const search = query.search?.trim();
  const phoneSearch = search ? phoneSearchFragment(search) : null;
  const where = {
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { academyName: { contains: search, mode: 'insensitive' as const } },
            ...(phoneSearch ? [{ phone: { contains: phoneSearch } }] : []),
          ],
        }
      : {}),
  };

  const [items, total, byStatus] = await Promise.all([
    platformPrisma.marketingLead.findMany({
      where,
      // id breaks ties, so leads created in the same instant keep a stable order.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    platformPrisma.marketingLead.count({ where }),
    platformPrisma.marketingLead.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Partial<
    Record<LeadStatus, number>
  >;

  return { items, total, page: query.page, pageSize: query.pageSize, counts };
}

export async function updateLead(id: string, changes: { status?: LeadStatus; notes?: string | null }) {
  const existing = await platformPrisma.marketingLead.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError('Lead not found');
  return platformPrisma.marketingLead.update({
    where: { id },
    data: {
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes?.trim() || null } : {}),
    },
  });
}

export async function deleteLead(id: string): Promise<void> {
  const { count } = await platformPrisma.marketingLead.deleteMany({ where: { id } });
  if (count === 0) throw new NotFoundError('Lead not found');
}

// ─── Platform settings ──────────────────────────────────────

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const row = await platformPrisma.platformSetting.findUnique({
    where: { key: PLATFORM_SETTING_KEYS.leadNotificationEmail },
  });
  return { leadNotificationEmail: row?.value ?? '' };
}

export async function updatePlatformSettings(settings: PlatformSettings): Promise<PlatformSettings> {
  const key = PLATFORM_SETTING_KEYS.leadNotificationEmail;
  if (settings.leadNotificationEmail === '') {
    await platformPrisma.platformSetting.deleteMany({ where: { key } });
  } else {
    await platformPrisma.platformSetting.upsert({
      where: { key },
      create: { key, value: settings.leadNotificationEmail },
      update: { value: settings.leadNotificationEmail },
    });
  }
  return getPlatformSettings();
}
