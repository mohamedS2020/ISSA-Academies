'use client';

/**
 * Tenant Detail Page (Super Admin)
 *
 * Shows tenant info, usage stats, and status management actions.
 * Editable fields: name, contact info.
 * Actions: Suspend, Reactivate, Delete (with confirmation dialogs).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useParams } from 'next/navigation';
import { useToast } from '@/components/feedback/toast-provider';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { Skeleton } from '@/components/feedback/skeleton-loader';

// ─── Types ──────────────────────────────────────────────────

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  schemaName: string;
  maxBranches: number;
  createdAt: string;
  updatedAt: string;
  config: {
    currency: string;
    defaultTimezone: string;
  } | null;
}

interface UsageStats {
  activeUsers: number;
  totalTrainees: number;
  activeSubscriptions: number;
  totalBranches: number;
  totalGroups: number;
}

// ─── API Helpers ────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  // Auth is the httpOnly access cookie, sent automatically on same-origin fetches.
  return { 'Content-Type': 'application/json' };
}

// ─── Status Badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-success-soft text-success',
    SUSPENDED: 'bg-warning-soft text-warning',
    DELETED: 'bg-danger-soft text-danger',
  };
  const labels: Record<string, string> = { ACTIVE: 'Active', SUSPENDED: 'Suspended', DELETED: 'Deleted' };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${styles[status] ?? styles.ACTIVE}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary dark:bg-primary/30 dark:text-primary">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────

export default function TenantDetailPage() {
  const t = useTranslations('superAdmin');
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ name: '', contactName: '', contactPhone: '', contactEmail: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    action: 'suspend' | 'reactivate' | 'delete';
  }>({ isOpen: false, action: 'suspend' });
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Fetch tenant details and usage
  const loadTenant = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tenantRes, usageRes] = await Promise.all([
        fetch(`/api/superadmin/tenants/${tenantId}`, { headers: getAuthHeaders() }),
        fetch(`/api/superadmin/tenants/${tenantId}/usage`, { headers: getAuthHeaders() }),
      ]);

      if (!tenantRes.ok) throw new Error('Failed to load tenant');

      const tenantData = await tenantRes.json();
      setTenant(tenantData.data);
      setEditData({
        name: tenantData.data.name,
        contactName: tenantData.data.contactName ?? '',
        contactPhone: tenantData.data.contactPhone ?? '',
        contactEmail: tenantData.data.contactEmail ?? '',
      });

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData.data);
      }
    } catch {
      toast.error('Failed to load academy details');
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => {
    loadTenant();
  }, [loadTenant]);

  // Save edits
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editData.name,
          contactName: editData.contactName || null,
          contactPhone: editData.contactPhone || null,
          contactEmail: editData.contactEmail || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const json = await res.json();
      setTenant(json.data);
      setIsEditing(false);
      toast.success(t('updateSuccess'));
    } catch {
      toast.error('Failed to update academy');
    } finally {
      setIsSaving(false);
    }
  };

  // Status change
  const handleStatusAction = async () => {
    const newStatus =
      confirmDialog.action === 'suspend' ? 'SUSPENDED'
        : confirmDialog.action === 'reactivate' ? 'ACTIVE'
          : 'DELETED';

    setIsActionLoading(true);
    try {
      const res = await fetch(`/api/superadmin/tenants/${tenantId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? 'Failed to update status');
      }
      const json = await res.json();
      setTenant(json.data);
      setConfirmDialog({ isOpen: false, action: 'suspend' });
      toast.success(t('statusChangeSuccess'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setIsActionLoading(false);
    }
  };

  // ─── Loading State ────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Academy not found.</p>
        <button
          onClick={() => router.push('../admin')}
          className="mt-4 text-sm text-primary hover:underline"
        >
          {t('backToList')}
        </button>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Back link */}
      <button
        onClick={() => router.push('../admin')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground/80"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('backToList')}
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-lg font-bold text-foreground shadow-md">
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {tenant.name}
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <StatusBadge status={tenant.status} />
              <span className="font-mono text-sm text-muted-foreground">{tenant.slug}</span>
            </div>
          </div>
        </div>
        {!isEditing && tenant.status !== 'DELETED' && (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            {t('editTenant')}
          </button>
        )}
      </div>

      {/* Usage Stats */}
      {usage && (
        <div>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('usageStats')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label={t('totalBranches')}
              value={usage.totalBranches}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}
            />
            <StatCard
              label={t('activeUsers')}
              value={usage.activeUsers}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>}
            />
            <StatCard
              label={t('totalTrainees')}
              value={usage.totalTrainees}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            />
            <StatCard
              label={t('activeSubscriptions')}
              value={usage.activeSubscriptions}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
            />
            <StatCard
              label={t('totalGroups')}
              value={usage.totalGroups}
              icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>}
            />
          </div>
        </div>
      )}

      {/* Tenant Details Card */}
      <div className="rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t('tenantDetails')}
          </h2>
        </div>

        <div className="p-6">
          {isEditing ? (
            /* Edit Mode */
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground/80">{t('tenantName')}</label>
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                    className="w-full rounded-lg border border-input px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground/80">{t('contactName')}</label>
                  <input
                    type="text"
                    value={editData.contactName}
                    onChange={(e) => setEditData((p) => ({ ...p, contactName: e.target.value }))}
                    className="w-full rounded-lg border border-input px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground/80">{t('contactPhone')}</label>
                  <input
                    type="tel"
                    value={editData.contactPhone}
                    onChange={(e) => setEditData((p) => ({ ...p, contactPhone: e.target.value }))}
                    className="w-full rounded-lg border border-input px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium text-foreground/80">{t('contactEmail')}</label>
                  <input
                    type="email"
                    value={editData.contactEmail}
                    onChange={(e) => setEditData((p) => ({ ...p, contactEmail: e.target.value }))}
                    className="w-full rounded-lg border border-input px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditData({
                      name: tenant.name,
                      contactName: tenant.contactName ?? '',
                      contactPhone: tenant.contactPhone ?? '',
                      contactEmail: tenant.contactEmail ?? '',
                    });
                  }}
                  className="rounded-lg border border-input px-4 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* View Mode */
            <dl className="grid gap-6 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('tenantName')}</dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{tenant.name}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('slug')}</dt>
                <dd className="mt-1 font-mono text-sm text-foreground">{tenant.slug}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('contactName')}</dt>
                <dd className="mt-1 text-sm text-foreground">{tenant.contactName || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('contactPhone')}</dt>
                <dd className="mt-1 text-sm text-foreground">{tenant.contactPhone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('contactEmail')}</dt>
                <dd className="mt-1 text-sm text-foreground">{tenant.contactEmail || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('maxBranches')}</dt>
                <dd className="mt-1 text-sm text-foreground">{tenant.maxBranches}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('createdAt')}</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {new Date(tenant.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </dd>
              </div>
              {tenant.config && (
                <>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('currency')}</dt>
                    <dd className="mt-1 text-sm text-foreground">{tenant.config.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('defaultTimezone')}</dt>
                    <dd className="mt-1 text-sm text-foreground">{tenant.config.defaultTimezone}</dd>
                  </div>
                </>
              )}
            </dl>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      {tenant.status !== 'DELETED' && (
        <div className="rounded-2xl border-2 border-danger/30 bg-card">
          <div className="border-b border-danger/30 px-6 py-4">
            <h2 className="text-lg font-semibold text-danger">
              {t('dangerZone')}
            </h2>
          </div>
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            {tenant.status === 'ACTIVE' && (
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('suspendTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('suspendMessage')}</p>
                </div>
                <button
                  onClick={() => setConfirmDialog({ isOpen: true, action: 'suspend' })}
                  className="whitespace-nowrap rounded-lg border border-warning/30 px-4 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning-soft"
                >
                  {t('suspend')}
                </button>
              </div>
            )}
            {tenant.status === 'SUSPENDED' && (
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('reactivateTitle')}</p>
                  <p className="text-xs text-muted-foreground">{t('reactivateMessage')}</p>
                </div>
                <button
                  onClick={() => setConfirmDialog({ isOpen: true, action: 'reactivate' })}
                  className="whitespace-nowrap rounded-lg border border-success/30 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success-soft"
                >
                  {t('reactivate')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-4 border-t border-danger/30 pt-4 sm:border-t-0 sm:pt-0">
              <div>
                <p className="text-sm font-medium text-foreground">{t('deleteTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('deleteMessage')}</p>
              </div>
              <button
                onClick={() => setConfirmDialog({ isOpen: true, action: 'delete' })}
                className="whitespace-nowrap rounded-lg border border-danger/30 px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
              >
                {t('deleteTenant')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.action === 'suspend' ? t('suspendTitle')
            : confirmDialog.action === 'reactivate' ? t('reactivateTitle')
              : t('deleteTitle')
        }
        message={
          confirmDialog.action === 'suspend' ? t('suspendMessage')
            : confirmDialog.action === 'reactivate' ? t('reactivateMessage')
              : t('deleteMessage')
        }
        confirmLabel={
          confirmDialog.action === 'suspend' ? t('suspend')
            : confirmDialog.action === 'reactivate' ? t('reactivate')
              : t('deleteTenant')
        }
        variant={confirmDialog.action === 'delete' ? 'danger' : confirmDialog.action === 'suspend' ? 'warning' : 'info'}
        typeToConfirm={confirmDialog.action === 'delete' ? t('deleteConfirmText') : undefined}
        isLoading={isActionLoading}
        onConfirm={handleStatusAction}
        onCancel={() => setConfirmDialog({ isOpen: false, action: 'suspend' })}
      />
    </div>
  );
}
