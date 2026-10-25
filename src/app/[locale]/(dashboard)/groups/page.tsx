'use client';

/**
 * Groups List Page
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
import { UserRole } from '@/types';
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
import { useToast } from '@/components/feedback/toast-provider';
import { DataTable, Column } from '@/components/tables/data-table';
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

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const filterFieldClass =
  'rounded-lg border border-input bg-card/80 px-2.5 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none';

// ─── Component ────────────────────────────────────────────────

function GroupsPageContent() {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const tDays = useTranslations('daysShort');
  const { user, authFetch } = useAuth();
  const can = useAccess();
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
      if (!res.ok) throw new Error(tCommon('loadFailed'));
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


  const columns: Column<Group>[] = [
    {
      key: 'groupName',
      header: t('groupName'),
      render: (row) => (
        <div>
          <p className="font-semibold text-foreground">{row.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{row.plan.name}</p>
        </div>
      ),
    },
    {
      key: 'captain',
      header: t('captain'),
      render: (row) => (
        <span className="text-sm text-foreground/80">{row.captain.user.name}</span>
      ),
    },
    {
      key: 'schedule',
      header: t('schedule'),
      render: (row) => (
        <div>
          <div className="flex flex-wrap gap-1 mb-1">
            {row.scheduleDays.map((day) => (
              <span key={day} className="px-1.5 py-0.5 bg-muted rounded text-xs text-foreground/80 border border-input/40">
                {tDays.has(day) ? tDays(day) : day}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {row.startTime} · {tCommon('minutes', { count: row.sessionDuration })}
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
              <span className={isFull ? 'text-danger' : 'text-foreground/80'}>
                {row._count.trainees}/{row.maxTrainees}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isFull ? 'bg-destructive' : pct > 70 ? 'bg-warning' : 'bg-success'}`}
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
            ? 'bg-success-soft text-success border border-success/30'
            : 'bg-muted/70 text-muted-foreground border border-input/30'
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
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-success border border-success/40 hover:border-success/60 hover:bg-success-soft transition-all flex items-center gap-1 whitespace-nowrap"
            >
              <UserPlus className="w-3 h-3" /> {t('addTrainee')}
            </button>
          )}
          <button
            onClick={() => router.push(`/${locale}/groups/${row.id}`)}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-foreground/80 border border-input/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all flex items-center gap-1"
          >
            {tCommon('view')} <ChevronRight className="w-3 h-3 rtl:-scale-x-100" aria-hidden="true" />
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
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Users2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('countInBranch', { count: pagination.total })}
            </p>
          </div>
        </div>
        {can('manageGroups') && (
          <button
            onClick={() => router.push(`/${locale}/groups/new`)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all duration-200 hover:-translate-y-0.5"
          >
            <Plus className="w-4 h-4" />
            {t('createGroup')}
          </button>
        )}
      </div>

      {canFilter && (
        <div className="flex flex-wrap items-end gap-3 p-4 rounded-2xl bg-card/70 border border-border/60">
          <div className="flex items-center gap-1.5 text-muted-foreground self-center">
            <Filter className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">{t('filters')}</span>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filterLevel')}</span>
            <select value={filters.planId} onChange={(e) => setFilters((f) => ({ ...f, planId: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('captain')}</span>
            <select value={filters.captainId} onChange={(e) => setFilters((f) => ({ ...f, captainId: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {captains.map((c) => <option key={c.id} value={c.id}>{c.user.name}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filterDay')}</span>
            <select value={filters.day} onChange={(e) => setFilters((f) => ({ ...f, day: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {DAYS.map((d) => <option key={d} value={d}>{tDays(d)}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('filterHour')}</span>
            <select value={filters.hour} onChange={(e) => setFilters((f) => ({ ...f, hour: e.target.value }))} className={filterFieldClass}>
              <option value="">{t('all')}</option>
              {HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('ageFrom')}</span>
            <input type="number" min={0} max={120} value={filters.ageMin} onChange={(e) => setFilters((f) => ({ ...f, ageMin: e.target.value }))} className={`${filterFieldClass} w-20`} placeholder="0" />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('ageTo')}</span>
            <input type="number" min={0} max={120} value={filters.ageMax} onChange={(e) => setFilters((f) => ({ ...f, ageMax: e.target.value }))} className={`${filterFieldClass} w-20`} placeholder="99" />
          </label>

          {Object.values(filters).some((v) => v !== '') && (
            <button
              onClick={() => setFilters({ planId: '', captainId: '', day: '', hour: '', ageMin: '', ageMax: '' })}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground border border-input hover:text-foreground hover:border-primary/50 transition-all self-end"
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

export default function GroupsPage() {
  return (
    <RequireAccess access="viewGroups" allowRoles={[UserRole.CAPTAIN]}>
      <GroupsPageContent />
    </RequireAccess>
  );
}
