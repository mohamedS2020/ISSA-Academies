'use client';

/**
 * Premium Branch Management Page
 *
 * Provides full CRUD capabilities for Academy Branches:
 *   - Search and list branches using a custom-styled DataTable.
 *   - Status indicators (Active / Inactive badges) with reactivate/deactivate toggles.
 *   - "Create Branch" and "Edit Branch" dialogs.
 *   - Warns when altering timezones.
 *   - Restricts non-admin access.
 *   - Built using logical property utilities (ms-, me-, ps-, pe-) for full LTR/RTL support.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { DataTable, Column } from '@/components/tables/data-table';
import {
  GitBranch,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  Building,
  Phone,
  MapPin,
  Clock,
  Search,
} from 'lucide-react';
import { useToast } from '@/components/feedback/toast-provider';

interface Branch {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  isActive: boolean;
  payrollFrequency: string;
  payrollCustomDays: number | null;
}

const PAYROLL_FREQUENCIES = ['WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'CUSTOM'];

const COMMON_TIMEZONES = [
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Amman',
  'Asia/Beirut',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Baghdad',
  'Europe/London',
  'UTC',
];

export default function BranchesPage() {
  const tBranches = useTranslations('branches');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [filteredBranches, setFilteredBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [includeInactive, setIncludeInactive] = useState(true);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('Africa/Cairo');
  const [payrollFrequency, setPayrollFrequency] = useState('MONTHLY');
  const [payrollCustomDays, setPayrollCustomDays] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load branches
  const fetchBranches = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(
        `/api/branches?includeInactive=${includeInactive}`
      );
      if (!res.ok) throw new Error('Failed to load branches');
      const data = await res.json();
      setBranches(data.data || []);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [includeInactive, toast, tCommon, authFetch]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  // Client-side search filtering
  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      setFilteredBranches(branches);
    } else {
      setFilteredBranches(
        branches.filter(
          (b) =>
            b.name.toLowerCase().includes(query) ||
            b.code.toLowerCase().includes(query) ||
            (b.address && b.address.toLowerCase().includes(query)) ||
            (b.phone && b.phone.includes(query))
        )
      );
    }
  }, [searchQuery, branches]);

  // Open Edit Modal
  const openEditModal = (branch: Branch) => {
    setEditingBranch(branch);
    setName(branch.name);
    setCode(branch.code);
    setAddress(branch.address || '');
    setPhone(branch.phone || '');
    setTimezone(branch.timezone);
    setPayrollFrequency(branch.payrollFrequency || 'MONTHLY');
    setPayrollCustomDays(branch.payrollCustomDays ? String(branch.payrollCustomDays) : '');
    setFormError(null);
  };

  // Close modals & reset form
  const resetForm = () => {
    setIsCreateOpen(false);
    setEditingBranch(null);
    setName('');
    setCode('');
    setAddress('');
    setPhone('');
    setTimezone('Africa/Cairo');
    setPayrollFrequency('MONTHLY');
    setPayrollCustomDays('');
    setFormError(null);
  };

  // Handle create branch
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError(tValidation('required', { field: tBranches('branchName') }));
      return;
    }
    if (!code.trim() || code.length < 2) {
      setFormError(tValidation('minLength', { field: tBranches('branchCode'), min: 2 }));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch('/api/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }

      toast.success(tCommon('success'));

      resetForm();
      fetchBranches();
    } catch (err: any) {
      setFormError(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle edit branch
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch) return;
    setFormError(null);

    if (!name.trim()) {
      setFormError(tValidation('required', { field: tBranches('branchName') }));
      return;
    }
    if (payrollFrequency === 'CUSTOM' && (!payrollCustomDays || Number(payrollCustomDays) < 1)) {
      setFormError('Custom payroll days is required when frequency is Custom');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await authFetch(`/api/branches/${editingBranch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          address: address.trim() || null,
          phone: phone.trim() || null,
          timezone,
          payrollFrequency,
          payrollCustomDays:
            payrollFrequency === 'CUSTOM' ? Number(payrollCustomDays) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }

      toast.success(tCommon('success'));

      resetForm();
      fetchBranches();
    } catch (err: any) {
      setFormError(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Branch Status (Deactivate / Reactivate)
  const handleToggleStatus = async (branch: Branch) => {
    const actionName = branch.isActive ? 'deactivate' : 'reactivate';
    const nextStatus = !branch.isActive;

    try {
      const res = await authFetch(`/api/branches/${branch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || tCommon('somethingWentWrong'));
      }

      toast.success(`${branch.name} has been ${actionName}d successfully.`);

      fetchBranches();
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    }
  };

  // Guard: Only ADMINS can manage branches
  if (user?.role !== UserRole.ADMIN) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle size={48} className="text-warning mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Only administrators can access the Branch Management settings.
        </p>
      </div>
    );
  }

  // Column definitions for the DataTable
  const columns: Column<Branch>[] = [
    {
      key: 'name',
      header: tBranches('branchName'),
      sortable: true,
      className: 'font-semibold text-foreground',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary dark:text-primary font-bold border border-primary/20">
            {row.name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-foreground">{row.name}</div>
            <div className="text-[10px] text-muted-foreground font-bold tracking-wide font-mono uppercase mt-0.5">
              Code: {row.code}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: tBranches('phone'),
      render: (row) => (
        <div className="flex items-center gap-1.5 text-foreground/80">
          <Phone size={13} className="text-muted-foreground" />
          <span>{row.phone || '—'}</span>
        </div>
      ),
    },
    {
      key: 'address',
      header: tBranches('address'),
      render: (row) => (
        <div className="flex items-center gap-1.5 text-foreground/80 max-w-xs truncate">
          <MapPin size={13} className="text-muted-foreground flex-shrink-0" />
          <span className="truncate">{row.address || '—'}</span>
        </div>
      ),
    },
    {
      key: 'timezone',
      header: tBranches('timezone'),
      render: (row) => (
        <div className="flex items-center gap-1.5 text-foreground/80 font-mono text-xs">
          <Clock size={13} className="text-primary" />
          <span>{row.timezone}</span>
        </div>
      ),
    },
    {
      key: 'isActive',
      header: tCommon('status'),
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            row.isActive
              ? 'bg-success-soft text-success border border-success/20'
              : 'bg-danger-soft text-danger border border-danger/20'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${row.isActive ? 'bg-success' : 'bg-destructive'}`} />
          {row.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Top Control Bar ─── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-wide text-foreground">
            {tBranches('title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Create, view, edit and suspend swimming academy branches.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Include Inactive Switch */}
          <label className="flex items-center cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="h-4 w-8 rounded-full bg-card border border-border peer-checked:bg-primary peer-checked:border-primary flex items-center p-0.5 transition-all duration-200">
              <div className="h-2.5 w-2.5 rounded-full bg-muted peer-checked:translate-x-full peer-checked:bg-background transition-all duration-200" />
            </div>
            <span className="ms-2 text-xs">
              Show Inactive
            </span>
          </label>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 hover:scale-[1.02] shadow-lg shadow-primary/10"
          >
            <Plus size={14} />
            <span>{tBranches('createBranch')}</span>
          </button>
        </div>
      </div>

      {/* ─── DataTable Wrapper ─── */}
      <div className="bg-card/70 border border-border shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={filteredBranches}
          isLoading={isLoading}
          searchPlaceholder={tCommon('search') + '...'}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          emptyMessage={tCommon('noResults')}
          actions={(row) => (
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => openEditModal(row)}
                className="h-7 w-7 rounded-lg border border-border hover:border-primary/50 bg-background flex items-center justify-center text-muted-foreground hover:text-primary dark:hover:text-primary transition-colors"
                title={tCommon('edit')}
              >
                <Edit2 size={13} />
              </button>
              
              <button
                onClick={() => handleToggleStatus(row)}
                className={`h-7 w-7 rounded-lg border bg-background flex items-center justify-center transition-colors ${
                  row.isActive
                    ? 'border-border hover:border-danger/50 text-muted-foreground hover:text-danger'
                    : 'border-border hover:border-success/50 text-muted-foreground hover:text-success'
                }`}
                title={row.isActive ? tBranches('deactivateBranch') : tCommon('yes')}
              >
                {row.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />}
              </button>
            </div>
          )}
        />
      </div>

      {/* ─── Create Branch Modal ─── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
          <div className="w-full max-w-lg p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-background border border-border/80 shadow-2xl backdrop-blur-xl animate-scaleUp">
            <div className="bg-card/95 rounded-[22px] p-6">
              
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <GitBranch className="text-primary dark:text-primary" size={18} />
                  <span>{tBranches('createBranch')}</span>
                </h3>
                <button
                  onClick={resetForm}
                  className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  &times;
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('branchName')} <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="New Cairo Branch"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                    />
                  </div>

                  {/* Code */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('branchCode')} <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="NC1"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground uppercase"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('phone')}
                    </label>
                    <input
                      type="tel"
                      placeholder="+20123456789"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                    />
                  </div>

                  {/* Timezone */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('timezone')} <span className="text-danger">*</span>
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.75rem_center] bg-no-repeat"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz} className="bg-background text-foreground">
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tBranches('address')}
                  </label>
                  <input
                    type="text"
                    placeholder="123 Road, District 5"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  />
                </div>

                {/* Warning Card */}
                <div className="p-3.5 rounded-2xl bg-warning-soft border border-warning/40 text-warning text-xs flex gap-3">
                  <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-1">Timezone Notice</span>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      {tBranches('timezoneWarning')}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                    <span>{tCommon('create')}</span>
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}

      {/* ─── Edit Branch Modal ─── */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
          <div className="w-full max-w-lg p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-primary/5 to-background border border-border/80 shadow-2xl backdrop-blur-xl animate-scaleUp">
            <div className="bg-card/95 rounded-[22px] p-6">
              
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <GitBranch className="text-primary dark:text-primary" size={18} />
                  <span>{tBranches('editBranch')}</span>
                </h3>
                <button
                  onClick={resetForm}
                  className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  &times;
                </button>
              </div>

              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2.5">
                  <AlertTriangle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleEdit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('branchName')} <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="New Cairo Branch"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                    />
                  </div>

                  {/* Code (Read-only on edit) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('branchCode')}
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={code}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-xs text-muted-foreground font-mono focus:outline-none cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Phone */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('phone')}
                    </label>
                    <input
                      type="tel"
                      placeholder="+20123456789"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                    />
                  </div>

                  {/* Timezone */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('timezone')} <span className="text-danger">*</span>
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M7%209l3%203%203-3%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1.25rem_1.25rem] bg-[right_0.75rem_center] bg-no-repeat"
                    >
                      {COMMON_TIMEZONES.map((tz) => (
                        <option key={tz} value={tz} className="bg-background text-foreground">
                          {tz}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {tBranches('address')}
                  </label>
                  <input
                    type="text"
                    placeholder="123 Road, District 5"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                  />
                </div>

                {/* Payroll Frequency (FR-FN-08) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {tBranches('payrollFrequency')}
                    </label>
                    <select
                      value={payrollFrequency}
                      onChange={(e) => setPayrollFrequency(e.target.value)}
                      className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                    >
                      {PAYROLL_FREQUENCIES.map((f) => (
                        <option key={f} value={f} className="bg-background text-foreground">
                          {tBranches(`payrollFrequencyOptions.${f}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {payrollFrequency === 'CUSTOM' && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {tBranches('payrollCustomDays')} <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        required
                        value={payrollCustomDays}
                        onChange={(e) => setPayrollCustomDays(e.target.value)}
                        className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all duration-300 text-foreground"
                      />
                    </div>
                  )}
                </div>

                {/* Warning Card */}
                <div className="p-3.5 rounded-2xl bg-warning-soft border border-warning/40 text-warning text-xs flex gap-3">
                  <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-1">Timezone Notice</span>
                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                      {tBranches('timezoneWarning')}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting && <Loader2 size={12} className="animate-spin" />}
                    <span>{tCommon('save')}</span>
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}
