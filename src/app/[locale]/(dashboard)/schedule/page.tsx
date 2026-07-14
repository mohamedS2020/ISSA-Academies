'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  XCircle,
  CalendarClock,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  isToday,
} from 'date-fns';

// ─── Types ───────────────────────────────────────────────────

interface Session {
  id: string;
  scheduledAt: string;
  scheduledAtLocal: string;
  durationMinutes: number;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  cancelledReason?: string;
  group: {
    id: string;
    name: string;
    captain?: { user?: { name: string } };
  };
  _count?: { attendanceRecords: number };
}

// ─── Status Badge ────────────────────────────────────────────

const STATUS_STYLES = {
  SCHEDULED: 'bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30',
  CANCELLED: 'bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30',
};

function StatusBadge({ status }: { status: Session['status'] }) {
  const t = useTranslations('schedule');
  const labels: Record<string, string> = {
    SCHEDULED: t('scheduled'),
    COMPLETED: t('completed'),
    CANCELLED: t('cancelled'),
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_STYLES[status]}`}>
      {labels[status]}
    </span>
  );
}

// ─── Session Card ────────────────────────────────────────────

function SessionCard({
  session,
  onClick,
}: {
  session: Session;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-start p-2 rounded-lg border cursor-pointer transition-all hover:scale-[1.02] hover:shadow-lg ${
        session.status === 'CANCELLED'
          ? 'bg-red-500/5 border-red-500/20 opacity-60'
          : 'bg-slate-900/5 dark:bg-white/5 border-slate-900/10 dark:border-white/10 hover:bg-slate-900/5 dark:hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">{session.group.name}</span>
        <StatusBadge status={session.status} />
      </div>
      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
        <Clock className="w-3 h-3 shrink-0" />
        <span className="text-[10px]">
          {session.scheduledAtLocal?.split('T')[1]?.slice(0, 5) ??
            format(parseISO(session.scheduledAt), 'HH:mm')}
        </span>
        <span className="text-[10px] text-slate-500 ms-auto">{session.durationMinutes}m</span>
      </div>
      {session.group.captain?.user?.name && (
        <p className="text-[10px] text-slate-500 truncate mt-0.5">
          {session.group.captain.user.name}
        </p>
      )}
    </button>
  );
}

// ─── Session Detail Modal ────────────────────────────────────

// scheduledAtLocal is branch-local "DD/MM/YYYY, HH:MM" — split into the date
// (YYYY-MM-DD) and time (HH:MM) the reschedule form pre-fills with.
function parseLocalDateTime(local: string | undefined): { date: string; time: string } {
  if (local && local.includes(', ')) {
    const [datePart, timePart] = local.split(', ');
    const [dd, mm, yyyy] = datePart.split('/');
    if (dd && mm && yyyy) return { date: `${yyyy}-${mm}-${dd}`, time: timePart };
  }
  return { date: '', time: '' };
}

function SessionModal({
  session,
  onClose,
  onCancel,
  onRescheduled,
}: {
  session: Session;
  onClose: () => void;
  onCancel: (id: string) => void;
  onRescheduled: () => void;
}) {
  const t = useTranslations('schedule');
  const params = useParams();
  const locale = params.locale as string;
  const { user, authFetch } = useAuth();
  // Cancel/reschedule are Admin/Moderator actions. Captains view only.
  const canManage =
    user?.role === UserRole.ADMIN || user?.role === UserRole.MODERATOR;
  const initialDateTime = parseLocalDateTime(session.scheduledAtLocal);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(initialDateTime.date);
  const [rescheduleTime, setRescheduleTime] = useState(initialDateTime.time);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    if (!cancelReason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/schedule/${session.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? 'Failed to cancel session');
      }
      onCancel(session.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReschedule() {
    if (!rescheduleDate || !rescheduleTime) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/schedule/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: rescheduleDate, time: rescheduleTime }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message ?? 'Failed to reschedule session');
      }
      onRescheduled();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 border border-slate-900/10 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{session.group.name}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {session.scheduledAtLocal
                ? format(parseISO(session.scheduledAt), 'EEEE, MMM d yyyy')
                : ''}{' '}
              ·{' '}
              {session.scheduledAtLocal?.split('T')[1]?.slice(0, 5) ??
                format(parseISO(session.scheduledAt), 'HH:mm')}
            </p>
          </div>
          <StatusBadge status={session.status} />
        </div>

        <div className="space-y-2 mb-4 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-400">{t('duration')}</span>
            <span className="text-slate-900 dark:text-white">{session.durationMinutes} min</span>
          </div>
          {session.group.captain?.user?.name && (
            <div className="flex justify-between">
              <span className="text-slate-600 dark:text-slate-400">{t('captain')}</span>
              <span className="text-slate-900 dark:text-white">{session.group.captain.user.name}</span>
            </div>
          )}
          {session.status === 'CANCELLED' && session.cancelledReason && (
            <div className="mt-3 p-3 bg-red-500/10 rounded-lg border border-red-500/20">
              <p className="text-xs text-red-600 dark:text-red-400">{session.cancelledReason}</p>
            </div>
          )}
        </div>

        {/* View the group this session belongs to */}
        <Link
          href={`/${locale}/groups/${session.group.id}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sm text-sky-700 dark:text-sky-300 hover:bg-sky-500/20 transition"
        >
          <Users className="w-4 h-4" />
          {t('viewGroup')}
        </Link>

        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm mb-3 p-2 bg-red-500/10 rounded-lg">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {session.status === 'SCHEDULED' && canManage && (
          <>
            {showCancelForm ? (
              <div className="space-y-3">
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('cancelReason')}
                  rows={3}
                  className="w-full bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelForm(false)}
                    className="flex-1 py-2 rounded-lg border border-slate-900/10 dark:border-white/10 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:bg-white/5 transition"
                  >
                    {t('back')}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving || !cancelReason.trim()}
                    className="flex-1 py-2 rounded-lg bg-red-600 text-sm text-white font-semibold hover:bg-red-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t('cancelSession')}
                  </button>
                </div>
              </div>
            ) : showRescheduleForm ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">{t('newDate')}</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">{t('newTime')}</label>
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRescheduleForm(false)}
                    className="flex-1 py-2 rounded-lg border border-slate-900/10 dark:border-white/10 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:bg-white/5 transition"
                  >
                    {t('back')}
                  </button>
                  <button
                    onClick={handleReschedule}
                    disabled={saving || !rescheduleDate || !rescheduleTime}
                    className="flex-1 py-2 rounded-lg bg-sky-600 text-sm text-white font-semibold hover:bg-sky-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t('confirmReschedule')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRescheduleForm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-900/10 dark:border-white/10 text-sm text-slate-900 dark:text-white hover:bg-slate-900/5 dark:hover:bg-white/10 transition"
                >
                  <CalendarClock className="w-4 h-4" />
                  {t('rescheduleSession')}
                </button>
                <button
                  onClick={() => setShowCancelForm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/20 transition"
                >
                  <XCircle className="w-4 h-4" />
                  {t('cancelSession')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function SchedulePage() {
  const t = useTranslations('schedule');
  const { authFetch } = useAuth();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);

  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart, { weekStartsOn: 0 }),
  });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const from = format(weekStart, 'yyyy-MM-dd');
      const to = format(endOfWeek(weekStart, { weekStartsOn: 0 }), 'yyyy-MM-dd');
      const res = await authFetch(`/api/schedule?dateFrom=${from}&dateTo=${to}&limit=100`);
      const data = await res.json();
      setSessions(data.data ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [weekStart, authFetch]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  function getSessionsForDay(day: Date) {
    return sessions.filter((s) => isSameDay(parseISO(s.scheduledAt), day));
  }

  function handleCancelled(sessionId: string) {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, status: 'CANCELLED' as const } : s
      )
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 dark:from-slate-950 via-white dark:via-slate-900 to-slate-50 dark:to-slate-950 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-sky-600 dark:text-sky-400" />
            {t('title')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">
            {format(weekStart, 'MMM d')} – {format(endOfWeek(weekStart, { weekStartsOn: 0 }), 'MMM d, yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-2 rounded-lg bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 transition"
          >
            {t('today')}
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-2 rounded-lg bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-sky-600 dark:text-sky-400 animate-spin" />
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-2">
        <div className="grid grid-cols-7 gap-3 min-w-[720px] md:min-w-0">
          {weekDays.map((day) => {
            const daySessions = getSessionsForDay(day);
            const dayIsToday = isToday(day);

            return (
              <div key={day.toISOString()} className="min-h-[200px]">
                {/* Day Header */}
                <div
                  className={`text-center mb-2 py-2 rounded-lg ${
                    dayIsToday
                      ? 'bg-sky-600 text-white'
                      : 'bg-slate-900/5 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider">
                    {format(day, 'EEE')}
                  </p>
                  <p className={`text-xl font-bold ${dayIsToday ? 'text-slate-900 dark:text-white' : 'text-slate-800 dark:text-slate-200'}`}>
                    {format(day, 'd')}
                  </p>
                </div>

                {/* Sessions */}
                <div className="space-y-1.5">
                  {daySessions.length === 0 ? (
                    <p className="text-[10px] text-slate-500 dark:text-slate-600 text-center py-4">{t('noSessions')}</p>
                  ) : (
                    daySessions.map((session) => (
                      <SessionCard
                        key={session.id}
                        session={session}
                        onClick={() => setSelectedSession(session)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onCancel={handleCancelled}
          onRescheduled={fetchSessions}
        />
      )}
    </div>
  );
}
