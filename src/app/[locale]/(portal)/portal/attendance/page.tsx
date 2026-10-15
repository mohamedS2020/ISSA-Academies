'use client';

/**
 * Portal Attendance (FR-TP-03)
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
  PRESENT: 'bg-success-soft text-success border-success/20',
  ABSENT: 'bg-danger-soft text-danger border-danger/20',
  EXCUSED: 'bg-warning-soft text-warning border-warning/20',
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
        <span className="text-foreground/80">
          {new Date(row.session.scheduledAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'group',
      header: t('group'),
      render: (row) => <span className="text-muted-foreground">{row.session.group.name}</span>,
    },
    {
      key: 'status',
      header: tCommon('status'),
      render: (row) => (
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
            STATUS_STYLES[row.status] ?? 'bg-muted text-foreground/80 border-input'
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
        <span className="text-muted-foreground text-xs max-w-xs truncate block">
          {row.notes || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide text-foreground flex items-center gap-2">
        <UserCheck size={22} className="text-primary dark:text-primary" />
        {t('attendance')}
      </h2>

      <div className="bg-card/70 border border-border shadow-2xl rounded-2xl p-4 backdrop-blur-xl">
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
