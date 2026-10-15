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
  SCHEDULED: 'bg-primary/10 text-primary dark:text-primary border border-primary/30',
  COMPLETED: 'bg-success-soft text-success border border-success/30',
  CANCELLED: 'bg-danger-soft text-danger border border-danger/30',
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
          ? 'bg-danger-soft border-danger/20 opacity-60'
          : 'bg-foreground/5 border-foreground/10 hover:bg-foreground/5'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-foreground truncate">{session.group.name}</span>
        <StatusBadge status={session.status} />
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Clock className="w-3 h-3 shrink-0" />
        <span className="text-[10px]">
          {session.scheduledAtLocal?.split('T')[1]?.slice(0, 5) ??
            format(parseISO(session.scheduledAt), 'HH:mm')}
        </span>
        <span className="text-[10px] text-muted-foreground ms-auto">{session.durationMinutes}m</span>
      </div>
      {session.group.captain?.user?.name && (
        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-foreground/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">{session.group.name}</h2>
            <p className="text-sm text-muted-foreground">
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
            <span className="text-muted-foreground">{t('duration')}</span>
            <span className="text-foreground">{session.durationMinutes} min</span>
          </div>
          {session.group.captain?.user?.name && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('captain')}</span>
              <span className="text-foreground">{session.group.captain.user.name}</span>
            </div>
          )}
          {session.status === 'CANCELLED' && session.cancelledReason && (
            <div className="mt-3 p-3 bg-danger-soft rounded-lg border border-danger/20">
              <p className="text-xs text-danger">{session.cancelledReason}</p>
            </div>
          )}
        </div>

        {/* View the group this session belongs to */}
        <Link
          href={`/${locale}/groups/${session.group.id}`}
          className="flex items-center justify-center gap-1.5 w-full py-2 mb-4 rounded-lg border border-primary/30 bg-primary/10 text-sm text-primary dark:text-primary hover:bg-primary/20 transition"
        >
          <Users className="w-4 h-4" />
          {t('viewGroup')}
        </Link>

        {error && (
          <div className="flex items-center gap-2 text-danger text-sm mb-3 p-2 bg-danger-soft rounded-lg">
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
                  className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-danger"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelForm(false)}
                    className="flex-1 py-2 rounded-lg border border-foreground/10 text-sm text-foreground/80 hover:bg-foreground/5 transition"
                  >
                    {t('back')}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={saving || !cancelReason.trim()}
                    className="flex-1 py-2 rounded-lg bg-destructive text-sm text-destructive-foreground font-semibold hover:bg-destructive/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
                    <label className="block text-xs text-muted-foreground mb-1">{t('newDate')}</label>
                    <input
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">{t('newTime')}</label>
                    <input
                      type="time"
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRescheduleForm(false)}
                    className="flex-1 py-2 rounded-lg border border-foreground/10 text-sm text-foreground/80 hover:bg-foreground/5 transition"
                  >
                    {t('back')}
                  </button>
                  <button
                    onClick={handleReschedule}
                    disabled={saving || !rescheduleDate || !rescheduleTime}
                    className="flex-1 py-2 rounded-lg bg-primary text-sm text-primary-foreground font-semibold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-foreground/10 text-sm text-foreground hover:bg-foreground/5 transition"
                >
                  <CalendarClock className="w-4 h-4" />
                  {t('rescheduleSession')}
                </button>
                <button
                  onClick={() => setShowCancelForm(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-danger/30 bg-danger-soft text-sm text-danger hover:bg-danger/15 transition"
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
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background p-4 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary dark:text-primary" />
            {t('title')}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {format(weekStart, 'MMM d')} – {format(endOfWeek(weekStart, { weekStartsOn: 0 }), 'MMM d, yyyy')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart((w) => subWeeks(w, 1))}
            className="p-2 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground/80 hover:bg-foreground/5 transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
          >
            {t('today')}
          </button>
          <button
            onClick={() => setWeekStart((w) => addWeeks(w, 1))}
            className="p-2 rounded-lg bg-foreground/5 border border-foreground/10 text-foreground/80 hover:bg-foreground/5 transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary dark:text-primary animate-spin" />
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
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/5 text-muted-foreground'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider">
                    {format(day, 'EEE')}
                  </p>
                  <p className={`text-xl font-bold ${dayIsToday ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </p>
                </div>

                {/* Sessions */}
                <div className="space-y-1.5">
                  {daySessions.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">{t('noSessions')}</p>
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
