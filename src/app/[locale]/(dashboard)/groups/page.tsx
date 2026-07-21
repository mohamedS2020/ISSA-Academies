'use client';

/**
 * ISSA — Groups List Page
 *
 * DataTable of groups in the current branch.
 * - Captain name, plan, trainee count/capacity, schedule days, start time
 * - Create → /groups/new
 * - View → /groups/[id]
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { DataTable, Column } from '@/components/tables/data-table';
import { UserRole } from '@/types';
import {
  Users2, Plus, XCircle, CheckCircle, ChevronRight, Filter, X, UserPlus,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  scheduleDays: string[];
  startTime: string;
  sessionDuration: number;
  maxTrainees: number;
  isActive: boolean;
  captain: { user: { name: string } };
  plan: { id: string; name: string };
  _count: { trainees: number };
}

interface Pagination {
  page: number; limit: number; total: number; totalPages: number;
}

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const filterFieldClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-primary focus:outline-none';

// ─── Component ────────────────────────────────────────────────

export default function GroupsPage() {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;

  const [groups, setGroups] = useState<Group[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1, limit: 20, total: 0, totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // ── Filters (Admin/Moderator only) ──────────────────────────
  const [filters, setFilters] = useState({
    planId: '', captainId: '', day: '', hour: '', ageMin: '', ageMax: '',
  });
  const [plans, setPlans] = useState<Array<{ id: string; name: string }>>([]);
  const [captains, setCaptains] = useState<Array<{ id: string; user: { name: string } }>>([]);
  const canFilter = user?.role === UserRole.ADMIN || user?.role === UserRole.MODERATOR;

  const fetchGroups = useCallback(async (page: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filters.planId) params.set('planId', filters.planId);
      if (filters.captainId) params.set('captainId', filters.captainId);
      if (filters.day) params.set('day', filters.day);
      if (filters.hour !== '') params.set('hour', filters.hour);
      if (filters.ageMin !== '') params.set('ageMin', filters.ageMin);
      if (filters.ageMax !== '') params.set('ageMax', filters.ageMax);
      const res = await authFetch(`/api/groups?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load groups');
      const data = await res.json();
      setGroups(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon, filters]);

  // Debounced (re)fetch on mount + whenever a filter changes.
  useEffect(() => {
    const id = setTimeout(() => fetchGroups(1), 300);
    return () => clearTimeout(id);
  }, [fetchGroups]);

  // Load filter option lists once (Admin/Moderator). The captains endpoint
  // may 403 for moderators without can_view_captains — that just leaves the
  // captain list empty, the other filters still work.
  useEffect(() => {
    if (!canFilter) return;
    (async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          authFetch('/api/subscriptions/plans?isActive=true&limit=100'),
          authFetch('/api/captains?limit=100'),
        ]);
        if (pRes.ok) { const d = await pRes.json(); setPlans(d.data || []); }
        if (cRes.ok) { const d = await cRes.json(); setCaptains(d.data || []); }
      } catch { /* ignore */ }
    })();
  }, [canFilter, authFetch]);

  if (user && user.role !== UserRole.ADMIN && user.role !== UserRole.MODERATOR && user.role !== UserRole.CAPTAIN) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" /> Access denied.
      </div>
    );
  }

  const columns: Column<Group>[] = [
    {
      key: 'groupName',
      header: t('groupName'),
      render: (row) => (
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{row.plan.name}</p>
        </div>
      ),
    },
    {
      key: 'captain',
      header: t('captain'),
      render: (row) => (
        <span className="text-sm text-slate-700 dark:text-slate-300">{row.captain.user.name}</span>
      ),
    },
    {
      key: 'schedule',
      header: t('schedule'),
      render: (row) => (
        <div>
          <div className="flex flex-wrap gap-1 mb-1">
            {row.scheduleDays.map((day) => (
              <span key={day} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700/60 rounded text-xs text-slate-700 dark:text-slate-300 border border-slate-300/40 dark:border-slate-600/40">
                {DAY_SHORT[day] ?? day}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {row.startTime} · {row.sessionDuration}min
          </p>
        </div>
      ),
    },
    {
      key: 'capacity',
      header: t('capacity'),
      render: (row) => {
        const pct = Math.round((row._count.trainees / row.maxTrainees) * 100);
        const isFull = row._count.trainees >= row.maxTrainees;
        return (
          <div className="w-28">
            <div className="flex justify-between text-xs mb-1">
              <span className={isFull ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}>
                {row._count.trainees}/{row.maxTrainees}
              </span>
              <span className="text-slate-500">{pct}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (row) => (
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold w-fit ${
          row.isActive
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
            : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
        }`}>
          {row.isActive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {row.isActive ? tCommon('active') : tCommon('inactive')}
        </span>
      ),
    },
    {
      key: 'id',
      header: tCommon('actions'),
      render: (row) => (
        <div className="flex items-center gap-2">
          {canFilter && (
            <button
              onClick={() => router.push(`/${locale}/trainees/new?planId=${row.plan.id}&groupId=${row.id}`)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-600/40 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-all flex items-center gap-1 whitespace-nowrap"
            >
              <UserPlus className="w-3 h-3" /> {t('addTrainee')}
            </button>
          )}
          <button
            onClick={() => router.push(`/${locale}/groups/${row.id}`)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all flex items-center gap-1"
          >
            View <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-accent/20 border border-teal-500/30">
            <Users2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title')}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {pagination.total} {pagination.total === 1 ? 'group' : 'groups'} in this branch
            </p>
          </div>
        </div>
        {user?.role === UserRole.ADMIN && (
          <button
            onClick={() => router.push(`/${locale}/groups/new`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-accent text-white text-sm font-semibold hover:shadow-lg hover:shadow-teal-500/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            {t('createGroup')}
          </button>
        )}
      </div>

      {canFilter && (
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-800/60">
          <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 self-center">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">{t('filters')}</span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('filterLevel')}</span>
            <select value={filters.planId} onChange={(e) => setFilters((f) => ({ ...f, planId: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('captain')}</span>
            <select value={filters.captainId} onChange={(e) => setFilters((f) => ({ ...f, captainId: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {captains.map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('filterDay')}</span>
            <select value={filters.day} onChange={(e) => setFilters((f) => ({ ...f, day: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {DAYS.map((d) => <option key={d} value={d}>{DAY_SHORT[d]}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('filterHour')}</span>
            <select value={filters.hour} onChange={(e) => setFilters((f) => ({ ...f, hour: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('ageFrom')}</span>
            <input type="number" min={0} max={120} value={filters.ageMin} onChange={(e) => setFilters((f) => ({ ...f, ageMin: e.target.value }))} className={`${filterFieldClass} w-20`} placeholder="0" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('ageTo')}</span>
            <input type="number" min={0} max={120} value={filters.ageMax} onChange={(e) => setFilters((f) => ({ ...f, ageMax: e.target.value }))} className={`${filterFieldClass} w-20`} placeholder="99" />
          </label>

          {Object.values(filters).some((v) => v !== '') && (
            <button
              onClick={() => setFilters({ planId: '', captainId: '', day: '', hour: '', ageMin: '', ageMax: '' })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-all self-end"
            >
              <X className="w-3 h-3" /> {t('clearFilters')}
            </button>
          )}
        </div>
      )}

      <DataTable
        columns={columns}
        data={groups}
        isLoading={isLoading}
        emptyMessage={tCommon('noResults')}
        pagination={pagination}
        onPageChange={fetchGroups}
      />
    </div>
  );
}
