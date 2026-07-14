'use client';

/**
 * ISSA — Portal Schedule (FR-TP-02)
 *
 * Read-only chronological list of the trainee's upcoming sessions.
 * Simple list, not a calendar grid — a trainee has one fixed weekly
 * schedule via one group, so a list reads better (and better on mobile)
 * than a multi-column grid.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { usePortalTrainee } from '../../portal-trainee-context';
import { SkeletonTable } from '@/components/feedback/skeleton-loader';
import { Calendar, Clock, Award } from 'lucide-react';

interface SessionRow {
  id: string;
  scheduledAtLocal: string;
  durationMinutes: number;
  status: string;
  group: { name: string; captain: { user: { name: string } } };
}

export default function PortalSchedulePage() {
  const t = useTranslations('portal');
  const tSchedule = useTranslations('schedule');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const { selectedTraineeId } = usePortalTrainee();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/portal/schedule?limit=50${selectedTraineeId ? `&traineeId=${selectedTraineeId}` : ''}`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const json = await res.json();
      setSessions(json.data || []);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon, selectedTraineeId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide bg-gradient-to-r from-slate-900 via-slate-800 to-slate-600 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
        <Calendar size={22} className="text-cyan-600 dark:text-cyan-400" />
        {t('schedule')}
      </h2>

      <div className="rounded-2xl bg-white/70 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-900 p-4 backdrop-blur-xl shadow-xl">
        {isLoading ? (
          <SkeletonTable rows={5} cols={3} />
        ) : sessions.length === 0 ? (
          <p className="text-xs text-slate-500 py-12 text-center">{t('noUpcoming')}</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.group.name}</p>
                  <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                    <Award size={11} className="text-slate-500 dark:text-slate-600" />
                    {s.group.captain.user.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-full">
                    <Clock size={12} />
                    {s.scheduledAtLocal}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {s.durationMinutes} {tSchedule('duration')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
