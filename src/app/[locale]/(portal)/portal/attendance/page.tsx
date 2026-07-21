'use client';

/**
 * ISSA — Portal Attendance (FR-TP-03)
 *
 * Read-only paginated attendance history.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { usePortalTrainee } from '../../portal-trainee-context';
import { DataTable, Column } from '@/components/tables/data-table';
import { UserCheck } from 'lucide-react';

interface AttendanceRow {
  id: string;
  status: string;
  markedAt: string;
  notes: string | null;
  session: { scheduledAt: string; group: { name: string } };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_STYLES: Record<string, string> = {
  PRESENT: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  ABSENT: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  EXCUSED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
};

export default function PortalAttendancePage() {
  const t = useTranslations('portal');
  const tAttendance = useTranslations('attendance');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const { selectedTraineeId } = usePortalTrainee();

  const fetchAttendance = useCallback(
    async (page: number) => {
      setIsLoading(true);
      try {
        const res = await authFetch(`/api/portal/attendance?page=${page}&limit=20${selectedTraineeId ? `&traineeId=${selectedTraineeId}` : ''}`);
        if (!res.ok) throw new Error('Failed to load attendance');
        const json = await res.json();
        setRecords(json.data || []);
        if (json.pagination) setPagination(json.pagination);
      } catch (err: any) {
        toast.error(err.message || tCommon('somethingWentWrong'));
      } finally {
        setIsLoading(false);
      }
    },
    [authFetch, toast, tCommon, selectedTraineeId]
  );

  useEffect(() => {
    fetchAttendance(1);
  }, [fetchAttendance]);

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'date',
      header: t('date'),
      render: (row) => (
        <span className="text-slate-700 dark:text-slate-300">
          {new Date(row.session.scheduledAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'group',
      header: t('group'),
      render: (row) => <span className="text-slate-600 dark:text-slate-400">{row.session.group.name}</span>,
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            STATUS_STYLES[row.status] ?? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
          }`}
        >
          {tAttendance(row.status.toLowerCase() as 'present' | 'absent' | 'excused')}
        </span>
      ),
    },
    {
      key: 'notes',
      header: tAttendance('notes'),
      render: (row) => (
        <span className="text-slate-500 text-xs max-w-xs truncate block">
          {row.notes || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
        <UserCheck size={22} className="text-primary dark:text-primary" />
        {t('attendance')}
      </h2>

      <div className="bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
        <DataTable
          columns={columns}
          data={records}
          isLoading={isLoading}
          pagination={pagination}
          onPageChange={fetchAttendance}
          emptyMessage={tCommon('noResults')}
        />
      </div>
    </div>
  );
}
