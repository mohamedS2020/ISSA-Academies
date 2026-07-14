'use client';

/**
 * ISSA — Tenant List Page (Super Admin)
 *
 * Displays all tenants in a data table with:
 *   - Status filter tabs (All / Active / Suspended)
 *   - Search by name
 *   - Row actions (View, Suspend/Reactivate, Delete)
 *   - Pagination
 *   - Skeleton loading
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { DataTable, type Column, type PaginationInfo } from '@/components/tables/data-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { useToast } from '@/components/feedback/toast-provider';

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
}

// ─── API Helpers ────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  if (typeof window === 'undefined') {
    return { 'Content-Type': 'application/json' };
  }
  const isRemembered = localStorage.getItem('issa_remember') === 'true';
  const storage = isRemembered ? localStorage : sessionStorage;
  const token = storage.getItem('issa_access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchTenants(params: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params.status && params.status !== 'ALL') query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const res = await fetch(`/api/superadmin/tenants?${query.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch tenants');
  return res.json();
}

async function changeTenantStatus(id: string, status: string) {
  const res = await fetch(`/api/superadmin/tenants/${id}/status`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? 'Failed to update status');
  }
  return res.json();
}

// ─── Status Badge ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    SUSPENDED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    DELETED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  const labels: Record<string, string> = {
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    DELETED: 'Deleted',
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] ?? styles.ACTIVE}`}>
      {labels[status] ?? status}
    </span>
  );
}

// ─── Page Component ─────────────────────────────────────────

export default function TenantListPage() {
  const t = useTranslations('superAdmin');
  const router = useRouter();
  const { toast } = useToast();

  // State
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    tenant: Tenant | null;
    action: 'suspend' | 'reactivate' | 'delete';
  }>({ isOpen: false, tenant: null, action: 'suspend' });
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Fetch tenants
  const loadTenants = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchTenants({
        status: statusFilter,
        search: search || undefined,
        page: pagination.page,
        limit: pagination.limit,
      });
      setTenants(data.data ?? []);
      if (data.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages,
        }));
      }
    } catch {
      toast.error('Failed to load academies');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, search, pagination.page, pagination.limit, toast]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Debounced search
  const [searchDebounce, setSearchDebounce] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchDebounce), 300);
    return () => clearTimeout(timer);
  }, [searchDebounce]);

  // Handle status change
  const handleStatusAction = async () => {
    if (!confirmDialog.tenant) return;

    const newStatus =
      confirmDialog.action === 'suspend'
        ? 'SUSPENDED'
        : confirmDialog.action === 'reactivate'
          ? 'ACTIVE'
          : 'DELETED';

    setIsActionLoading(true);
    try {
      await changeTenantStatus(confirmDialog.tenant.id, newStatus);
      toast.success(t('statusChangeSuccess'));
      setConfirmDialog({ isOpen: false, tenant: null, action: 'suspend' });
      loadTenants();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Column definitions
  const columns: Column<Tenant>[] = [
    {
      key: 'name',
      header: t('tenantName'),
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{row.slug}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'contactName',
      header: t('contactName'),
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-400">
          {row.contactName || '—'}
        </span>
      ),
    },
    {
      key: 'contactEmail',
      header: t('contactEmail'),
      render: (row) => (
        <span className="text-gray-600 dark:text-gray-400">
          {row.contactEmail || '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: t('createdAt'),
      sortable: true,
      render: (row) => (
        <span className="text-gray-500 dark:text-gray-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  // Status filter tabs
  const statusTabs = [
    { key: 'ALL', label: t('allStatuses') },
    { key: 'ACTIVE', label: t('statusActive') },
    { key: 'SUSPENDED', label: t('statusSuspended') },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('tenants')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('title')}
          </p>
        </div>
        <button
          onClick={() => router.push('./admin/create')}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 hover:shadow-md"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('createTenant')}
        </button>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatusFilter(tab.key);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all sm:flex-none ${
              statusFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <DataTable<Tenant>
        columns={columns}
        data={tenants}
        isLoading={isLoading}
        searchValue={searchDebounce}
        searchPlaceholder={t('searchPlaceholder')}
        onSearchChange={setSearchDebounce}
        emptyMessage={t('noTenants')}
        pagination={pagination}
        onPageChange={(page) => setPagination((prev) => ({ ...prev, page }))}
        actions={(row) => (
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => router.push(`./admin/${row.id}`)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            >
              {t('viewDetails')}
            </button>
            {row.status === 'ACTIVE' && (
              <button
                onClick={() =>
                  setConfirmDialog({ isOpen: true, tenant: row, action: 'suspend' })
                }
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
              >
                {t('suspend')}
              </button>
            )}
            {row.status === 'SUSPENDED' && (
              <button
                onClick={() =>
                  setConfirmDialog({ isOpen: true, tenant: row, action: 'reactivate' })
                }
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
              >
                {t('reactivate')}
              </button>
            )}
            {row.status !== 'DELETED' && (
              <button
                onClick={() =>
                  setConfirmDialog({ isOpen: true, tenant: row, action: 'delete' })
                }
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                {t('deleteTenant')}
              </button>
            )}
          </div>
        )}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={
          confirmDialog.action === 'suspend'
            ? t('suspendTitle')
            : confirmDialog.action === 'reactivate'
              ? t('reactivateTitle')
              : t('deleteTitle')
        }
        message={
          confirmDialog.action === 'suspend'
            ? t('suspendMessage')
            : confirmDialog.action === 'reactivate'
              ? t('reactivateMessage')
              : t('deleteMessage')
        }
        confirmLabel={
          confirmDialog.action === 'suspend'
            ? t('suspend')
            : confirmDialog.action === 'reactivate'
              ? t('reactivate')
              : t('deleteTenant')
        }
        variant={
          confirmDialog.action === 'delete'
            ? 'danger'
            : confirmDialog.action === 'suspend'
              ? 'warning'
              : 'info'
        }
        typeToConfirm={
          confirmDialog.action === 'delete' ? t('deleteConfirmText') : undefined
        }
        isLoading={isActionLoading}
        onConfirm={handleStatusAction}
        onCancel={() =>
          setConfirmDialog({ isOpen: false, tenant: null, action: 'suspend' })
        }
      />
    </div>
  );
}
