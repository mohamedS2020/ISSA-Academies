/**
 * Client-side calls for the Super Admin Leads and Settings pages, shaped for
 * React Query. Auth is the httpOnly access cookie, sent automatically on
 * same-origin requests.
 */

import type { LeadStatus } from '@/schemas/lead.schema';

export interface Lead {
  id: string;
  name: string;
  academyName: string;
  phone: string;
  branches: string;
  sport: string;
  locale: string;
  status: LeadStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsPage {
  items: Lead[];
  counts: Partial<Record<LeadStatus, number>>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PlatformSettings {
  leadNotificationEmail: string;
  emailConfigured: boolean;
}

export const leadKeys = {
  all: ['superadmin', 'leads'] as const,
  list: (filters: { status?: LeadStatus; search?: string; page: number }) =>
    [...leadKeys.all, 'list', filters] as const,
};

export const settingsKey = ['superadmin', 'settings'] as const;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(body?.error?.message ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export async function fetchLeads(filters: {
  status?: LeadStatus;
  search?: string;
  page: number;
  pageSize?: number;
}): Promise<LeadsPage> {
  const query = new URLSearchParams({ page: String(filters.page), pageSize: String(filters.pageSize ?? 25) });
  if (filters.status) query.set('status', filters.status);
  if (filters.search) query.set('search', filters.search);
  const body = await request<{ data: Omit<LeadsPage, 'pagination'>; pagination: LeadsPage['pagination'] }>(
    `/api/superadmin/leads?${query}`
  );
  return { ...body.data, pagination: body.pagination };
}

export async function updateLead(id: string, changes: { status?: LeadStatus; notes?: string | null }) {
  const body = await request<{ data: Lead }>(`/api/superadmin/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
  return body.data;
}

export async function deleteLead(id: string): Promise<void> {
  await request<void>(`/api/superadmin/leads/${id}`, { method: 'DELETE' });
}

export async function fetchSettings(): Promise<PlatformSettings> {
  return (await request<{ data: PlatformSettings }>('/api/superadmin/settings')).data;
}

export async function saveSettings(settings: { leadNotificationEmail: string }): Promise<PlatformSettings> {
  return (
    await request<{ data: PlatformSettings }>('/api/superadmin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  ).data;
}
