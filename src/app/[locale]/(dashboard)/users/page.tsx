'use client';

/**
 * ISSA — User Management Page
 *
 * CRUD for Admin and Moderator accounts within the current branch.
 * - Displays a searchable, filterable DataTable of users.
 * - "Create User" dialog with role selector and privilege grid for Moderators.
 * - Edit, deactivate, and password reset actions.
 * - Admin-only access (redirects if not Admin).
 * - Full RTL support via logical CSS properties (ms-, me-, ps-, pe-).
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole, MODERATOR_PRIVILEGES } from '@/types';
import { PRIVILEGE_GROUPS } from '@/lib/auth/privilege-groups';
import { DataTable, Column } from '@/components/tables/data-table';
import { useToast } from '@/components/feedback/toast-provider';
import {
  Users,
  Plus,
  Edit2,
  PowerOff,
  KeyRound,
  Shield,
  ShieldCheck,
  Loader2,
  Search,
  X,
  Eye,
  EyeOff,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface UserRow {
  id: string;
  name: string;
  phoneNumber: string;
  role: UserRole;
  isActive: boolean;
  privileges: string[];
  language: string;
  lastLoginAt: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Component ────────────────────────────────────────────────

export default function UsersPage() {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');

  // Dialog state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Create / Edit form state
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>(UserRole.MODERATOR);
  const [privileges, setPrivileges] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // One-time display after creation
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  // ─── Data fetching ──────────────────────────────────────────
  // Defined BEFORE any conditional return — hooks must never be skipped.

  const fetchUsers = useCallback(async (page: number, searchQuery: string, roleQuery: string) => {
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '20' });
      if (searchQuery) qs.set('search', searchQuery);
      if (roleQuery) qs.set('role', roleQuery);
      const res = await authFetch(`/api/users?${qs}`);
      if (!res.ok) throw new Error('Failed to load users');
      const data = await res.json();
      setUsers(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon]); // search/roleFilter passed as args — not in deps

  useEffect(() => {
    fetchUsers(1, '', '');
  }, [fetchUsers]);

  // Re-fetch when filter controls change
  useEffect(() => {
    fetchUsers(1, search, roleFilter);
  }, [search, roleFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guard: Admin only — AFTER all hooks
  if (user && user.role !== UserRole.ADMIN) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <Shield className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied. Admin only.</span>
      </div>
    );
  }

  // ─── Form helpers ───────────────────────────────────────────

  const resetForm = () => {
    setName(''); setPhoneNumber(''); setPassword('');
    setRole(UserRole.MODERATOR); setPrivileges([]); setFormError(null);
    setShowPassword(false);
  };

  const openCreate = () => { resetForm(); setIsCreateOpen(true); };
  const openEdit = (u: UserRow) => {
    setEditingUser(u);
    setName(u.name); setPhoneNumber(u.phoneNumber);
    setRole(u.role as UserRole); setPrivileges(u.privileges);
    setFormError(null);
  };
  const closeDialogs = () => {
    setIsCreateOpen(false); setEditingUser(null); resetForm();
  };

  const togglePrivilege = (priv: string) => {
    setPrivileges((prev) =>
      prev.includes(priv) ? prev.filter((p) => p !== priv) : [...prev, priv]
    );
  };

  // ─── Actions ────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!name.trim() || !phoneNumber.trim() || !password.trim()) {
      setFormError('Name, phone, and password are required');
      return;
    }
    setIsSubmitting(true); setFormError(null);
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber, password, role, privileges }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create user');
      toast.success(`User "${name}" created successfully`);
      closeDialogs();
      fetchUsers(1, search, roleFilter);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    setIsSubmitting(true); setFormError(null);
    try {
      // Update basic info
      await authFetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phoneNumber }),
      });
      // Update privileges if moderator
      if (editingUser.role === UserRole.MODERATOR) {
        await authFetch(`/api/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ privileges }),
        });
      }
      toast.success(`User "${name}" updated`);
      closeDialogs();
      fetchUsers(pagination.page, search, roleFilter);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (u: UserRow) => {
    if (!confirm(`Deactivate user "${u.name}"? They will lose access.`)) return;
    try {
      const res = await authFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (!res.ok) throw new Error('Failed to deactivate user');
      toast.success(`User "${u.name}" deactivated`);
      fetchUsers(pagination.page, search, roleFilter);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePasswordReset = async (u: UserRow) => {
    if (!confirm(`Reset password for "${u.name}"? A new password will be generated.`)) return;
    try {
      const res = await authFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_password' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to reset password');
      setCreatedPassword(data.data.newPassword);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ─── Table columns ──────────────────────────────────────────

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: t('name'),
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{row.phoneNumber}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('role'),
      render: (row) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
          row.role === UserRole.ADMIN
            ? 'bg-primary/20 text-primary dark:text-primary border border-primary/30'
            : 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30'
        }`}>
          {row.role === UserRole.ADMIN ? (
            <ShieldCheck className="w-3 h-3" />
          ) : (
            <Shield className="w-3 h-3" />
          )}
          {row.role === UserRole.ADMIN ? t('admin') : t('moderator')}
        </span>
      ),
    },
    {
      key: 'privileges',
      header: t('privileges'),
      render: (row) =>
        row.role === UserRole.MODERATOR ? (
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {row.privileges.length} / {MODERATOR_PRIVILEGES.length}
          </span>
        ) : (
          <span className="text-xs text-primary dark:text-primary font-medium">Full access</span>
        ),
    },
    {
      key: 'isActive',
      header: tCommon('status'),
      render: (row) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
          row.isActive
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
        }`}>
          {row.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
    {
      key: 'id',
      header: tCommon('actions'),
      render: (row) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => openEdit(row)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-colors"
            title={t('editUser')}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handlePasswordReset(row)}
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Reset Password"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          {row.isActive && (
            <button
              onClick={() => handleDeactivate(row)}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Deactivate"
            >
              <PowerOff className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  // ─── Dialog (shared for create & edit) ──────────────────────

  const isDialogOpen = isCreateOpen || !!editingUser;

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Users className="w-6 h-6 text-primary dark:text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {pagination.total} {pagination.total === 1 ? 'user' : 'users'} in this branch
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
        >
          <Plus className="w-4 h-4" />
          {t('createUser')}
        </button>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full ps-9 pe-4 py-2.5 bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-3 py-2.5 bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-primary/60 transition-all"
        >
          <option value="">{tCommon('all')} roles</option>
          <option value="ADMIN">{t('admin')}</option>
          <option value="MODERATOR">{t('moderator')}</option>
        </select>
      </div>

      {/* ─── Data Table ─── */}
      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        emptyMessage={tCommon('noResults')}
        pagination={pagination}
        onPageChange={(page) => fetchUsers(page, search, roleFilter)}
      />

      {/* ─── Create / Edit Dialog ─── */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
            {/* Dialog Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-300/60 dark:border-slate-700/60">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                {isCreateOpen ? t('createUser') : t('editUser')}
              </h2>
              <button
                onClick={closeDialogs}
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700/50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dialog Body */}
            <div className="p-6 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('name')} <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60 transition-all"
                  placeholder="Full name"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('phoneNumber')} <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60 transition-all"
                  placeholder="+201234567890"
                />
              </div>

              {/* Password — only on create */}
              {isCreateOpen && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3 pe-10 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60 transition-all"
                      placeholder="Min 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Role — only on create */}
              {isCreateOpen && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('role')} <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <div className="flex gap-3">
                    {[UserRole.MODERATOR, UserRole.ADMIN].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => { setRole(r); if (r === UserRole.ADMIN) setPrivileges([]); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                          role === r
                            ? 'bg-primary/20 border-primary/60 text-primary dark:text-primary'
                            : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                        }`}
                      >
                        {r === UserRole.ADMIN ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                        {r === UserRole.ADMIN ? t('admin') : t('moderator')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Privilege Grid — for Moderators */}
              {role === UserRole.MODERATOR && (
                <div className="mt-4 space-y-4">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    {t('configurePrivileges')}
                  </p>
                  {Object.entries(PRIVILEGE_GROUPS).map(([groupKey, group]) => (
                    <div key={groupKey}>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">{group.label}</p>
                      <div className="flex flex-wrap gap-2">
                        {group.privileges.map((priv) => (
                          <label key={priv} className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={privileges.includes(priv)}
                              onChange={() => togglePrivilege(priv)}
                              className="w-4 h-4 rounded accent-cyan-500"
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200 transition-colors">
                              {priv.replace('can_', '').replace(/_/g, ' ')}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {formError && (
                <p className="text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            {/* Dialog Footer */}
            <div className="flex justify-end gap-3 p-6 border-t border-slate-300/60 dark:border-slate-700/60">
              <button
                onClick={closeDialogs}
                className="px-4 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-700/50 transition-colors"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={isCreateOpen ? handleCreate : handleUpdate}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {tCommon('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Password Display Modal (one-time) ─── */}
      {createdPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-sm p-6 shadow-2xl shadow-black/50">
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <KeyRound className="w-7 h-7 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">New Password Generated</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Share this password with the user. It will <strong className="text-amber-600 dark:text-amber-400">not be shown again</strong>.
              </p>
              <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 font-mono text-lg text-primary dark:text-primary tracking-wider select-all">
                {createdPassword}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(createdPassword); toast.success('Copied!'); }}
                className="w-full py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
              >
                Copy to Clipboard
              </button>
              <button
                onClick={() => setCreatedPassword(null)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold"
              >
                I've saved it — Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
