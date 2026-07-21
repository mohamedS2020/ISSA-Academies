'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Loader2,
  Search,
  AlertCircle,
  Send,
  User,
  ChevronDown,
  Clock,
  Award,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

// ─── Types ───────────────────────────────────────────────────

interface TraineeAttendance {
  traineeId: string;
  systemCode: string;
  name: string;
  activeSubscription: {
    id: string;
    attendedSessions: number;
    totalSessions: number;
    freezeUsed: number;
    status: string;
  } | null;
  subscriptionEnded: boolean; // ended but still in grace → greyed + un-markable
  canMark: boolean; // false when the subscription has ended
  attendance: {
    status: 'PRESENT' | 'ABSENT' | 'EXCUSED';
    notes?: string;
  } | null;
}

interface AttendanceSheet {
  session: {
    id: string;
    status: string;
    scheduledAt: string;
    scheduledAtLocal: string;
    durationMinutes: number;
    groupName: string;
  };
  trainees: TraineeAttendance[];
}

interface TodaySession {
  id: string;
  scheduledAt: string;
  scheduledAtLocal: string;
  status: string;
  group: { id: string; name: string; captain?: { user?: { name: string } } };
}

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'EXCUSED';

// ─── Status Toggle ───────────────────────────────────────────

const STATUS_CONFIG: Record<AttendanceStatus, { icon: any; label: string; class: string }> = {
  PRESENT: {
    icon: CheckCircle2,
    label: 'Present',
    class: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
  },
  ABSENT: {
    icon: XCircle,
    label: 'Absent',
    class: 'bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/40',
  },
  EXCUSED: {
    icon: MinusCircle,
    label: 'Excused',
    class: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40',
  },
};

function StatusToggle({
  value,
  onChange,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
}) {
  const statuses: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'EXCUSED'];

  return (
    <div className="flex gap-1">
      {statuses.map((s) => {
        const cfg = STATUS_CONFIG[s];
        const Icon = cfg.icon;
        const active = value === s;
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition-all ${
              active
                ? cfg.class
                : 'bg-slate-900/5 dark:bg-white/3 border-slate-900/10 dark:border-white/10 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{cfg.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

export default function AttendancePage() {
  const t = useTranslations('attendance');
  const { user, authFetch } = useAuth();

  // Step 1: session selection (+ captain / hour filters)
  const [todaySessions, setTodaySessions] = useState<TodaySession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [filterCaptain, setFilterCaptain] = useState('');
  const [filterHour, setFilterHour] = useState('');

  // Step 2: attendance sheet
  const [sheet, setSheet] = useState<AttendanceSheet | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Local attendance state: traineeId → status
  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceStatus>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── Load today's sessions ───────────────────────────────
  useEffect(() => {
    async function load() {
      setLoadingSessions(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      try {
        const res = await authFetch(`/api/schedule?dateFrom=${today}&dateTo=${today}&limit=50`);
        const data = await res.json();
        setTodaySessions(data.data ?? []);
      } catch {
        setTodaySessions([]);
      } finally {
        setLoadingSessions(false);
      }
    }
    load();
  }, [authFetch]);

  // ── Load attendance sheet when session selected ─────────
  useEffect(() => {
    if (!selectedSessionId) return;

    setLoadingSheet(true);
    setSheet(null);
    setAttendanceMap({});
    setNotesMap({});
    setSubmitSuccess(false);

    authFetch(`/api/attendance/${selectedSessionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) {
          setSheet(data.data);
          // Pre-fill existing attendance
          const existing: Record<string, AttendanceStatus> = {};
          data.data.trainees.forEach((t: TraineeAttendance) => {
            if (t.attendance) existing[t.traineeId] = t.attendance.status;
          });
          setAttendanceMap(existing);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingSheet(false));
  }, [selectedSessionId, authFetch]);

  // ── Submit attendance ────────────────────────────────────
  async function handleSubmit() {
    if (!sheet) return;

    // Only submit trainees whose subscription is still active — ended trainees
    // are greyed out and blocked (the backend rejects them too).
    const records = sheet.trainees
      .filter((tr) => tr.canMark)
      .map((tr) => ({
        traineeId: tr.traineeId,
        status: attendanceMap[tr.traineeId] ?? 'ABSENT',
        notes: notesMap[tr.traineeId] ?? undefined,
      }));

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await authFetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sheet.session.id, records }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Failed to submit');
      setSubmitSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isCancelled = sheet?.session.status === 'CANCELLED';
  const alreadyDone = sheet?.session.status === 'COMPLETED' && submitSuccess;

  // ── Session filters (by captain + hour) ─────────────────
  const sessionTime = (s: TodaySession) =>
    s.scheduledAtLocal?.split(', ')[1] ?? format(parseISO(s.scheduledAt), 'HH:mm');
  const sessionCaptain = (s: TodaySession) => s.group.captain?.user?.name ?? '';

  const captainOptions = Array.from(
    new Set(todaySessions.map(sessionCaptain).filter(Boolean))
  ).sort();
  const hourOptions = Array.from(new Set(todaySessions.map(sessionTime))).sort();

  const filteredSessions = todaySessions.filter(
    (s) =>
      (!filterCaptain || sessionCaptain(s) === filterCaptain) &&
      (!filterHour || sessionTime(s) === filterHour)
  );

  // ── Bulk marking + live tally ───────────────────────────
  const markableTrainees = sheet?.trainees.filter((tr) => tr.canMark) ?? [];
  const counts = markableTrainees.reduce(
    (acc, tr) => {
      const s = attendanceMap[tr.traineeId];
      if (s === 'PRESENT') acc.PRESENT++;
      else if (s === 'EXCUSED') acc.EXCUSED++;
      else if (s === 'ABSENT') acc.ABSENT++;
      else acc.unmarked++;
      return acc;
    },
    { PRESENT: 0, ABSENT: 0, EXCUSED: 0, unmarked: 0 }
  );

  function markAll(status: AttendanceStatus) {
    setAttendanceMap((prev) => {
      const next = { ...prev };
      markableTrainees.forEach((tr) => {
        next[tr.traineeId] = status;
      });
      return next;
    });
  }

  // Attendance is an Admin/Moderator task — captains don't mark attendance.
  // Defense-in-depth: the nav item is already hidden for captains, but guard
  // direct navigation too (the attendance APIs require MODERATOR regardless).
  if (user && user.role !== UserRole.ADMIN && user.role !== UserRole.MODERATOR) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-600 dark:text-slate-400">
        <XCircle className="w-8 h-8 me-3 text-red-600 dark:text-red-400" />
        <span>Access denied.</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 dark:from-slate-950 via-white dark:via-slate-900 to-slate-50 dark:to-slate-950 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-violet-600 dark:text-violet-400" />
          {t('title')}
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mt-1">{t('markAttendance')}</p>
      </div>

      {/* Step 1 — Session Selector */}
      <div className="bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-2xl p-5 mb-5">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          {t('selectSession')}
        </label>

        {loadingSessions ? (
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading sessions...</span>
          </div>
        ) : todaySessions.length === 0 ? (
          <p className="text-slate-500 text-sm">{t('noSessions')}</p>
        ) : (
          <div className="space-y-3">
            {/* Filters — narrow the list by captain and/or start hour */}
            {(captainOptions.length > 1 || hourOptions.length > 1) && (
              <div className="flex flex-wrap gap-3">
                {captainOptions.length > 1 && (
                  <div className="relative flex-1 min-w-[160px]">
                    <Award className="absolute start-3 top-3 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
                    <select
                      value={filterCaptain}
                      onChange={(e) => setFilterCaptain(e.target.value)}
                      className="w-full appearance-none bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-xl ps-9 pe-8 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">{t('allCaptains')}</option>
                      {captainOptions.map((c) => (
                        <option key={c} value={c} className="bg-slate-100 dark:bg-slate-800">{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute end-3 top-3 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
                  </div>
                )}
                {hourOptions.length > 1 && (
                  <div className="relative flex-1 min-w-[120px]">
                    <Clock className="absolute start-3 top-3 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
                    <select
                      value={filterHour}
                      onChange={(e) => setFilterHour(e.target.value)}
                      className="w-full appearance-none bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-xl ps-9 pe-8 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    >
                      <option value="">{t('allHours')}</option>
                      {hourOptions.map((h) => (
                        <option key={h} value={h} className="bg-slate-100 dark:bg-slate-800">{h}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute end-3 top-3 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            {/* Session picker (filtered) */}
            <div className="relative">
              <select
                value={selectedSessionId ?? ''}
                onChange={(e) => setSelectedSessionId(e.target.value || null)}
                className="w-full appearance-none bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 pr-10"
              >
                <option value="">{t('selectSession')}...</option>
                {filteredSessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-100 dark:bg-slate-800">
                    {/* scheduledAtLocal is branch-local "DD/MM/YYYY, HH:MM" — take the time part */}
                    {s.group.name} — {sessionTime(s)}
                    {sessionCaptain(s) ? ` · ${sessionCaptain(s)}` : ''} [{s.status}]
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute end-3 top-3.5 w-4 h-4 text-slate-600 dark:text-slate-400 pointer-events-none" />
            </div>
            {filteredSessions.length === 0 && (
              <p className="text-xs text-slate-500">{t('noSessionsMatch')}</p>
            )}
          </div>
        )}
      </div>

      {/* Step 2 — Attendance Sheet */}
      {selectedSessionId && (
        <div className="bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-2xl overflow-hidden">
          {loadingSheet ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-violet-600 dark:text-violet-400 animate-spin" />
            </div>
          ) : !sheet ? null : (
            <>
              {/* Session info strip */}
              <div className="px-5 py-3 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{sheet.session.groupName}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {sheet.session.scheduledAtLocal ?? format(parseISO(sheet.session.scheduledAt), 'dd/MM/yyyy, HH:mm')} · {sheet.session.durationMinutes}min
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    sheet.session.status === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                      : sheet.session.status === 'CANCELLED'
                      ? 'bg-red-500/20 text-red-600 dark:text-red-400'
                      : 'bg-primary/20 text-primary dark:text-primary'
                  }`}
                >
                  {sheet.session.status}
                </span>
              </div>

              {/* Quick actions + live tally */}
              {!isCancelled && sheet.trainees.length > 0 && (
                <div className="px-5 py-3 border-b border-slate-900/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      {counts.PRESENT} {t('present')}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-red-500/15 text-red-600 dark:text-red-400">
                      {counts.ABSENT} {t('absent')}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      {counts.EXCUSED} {t('excused')}
                    </span>
                    {counts.unmarked > 0 && (
                      <span className="px-2 py-1 rounded-full bg-slate-900/5 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                        {counts.unmarked} {t('unmarked')}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => markAll('PRESENT')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-xs font-semibold transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('markAllPresent')}
                  </button>
                </div>
              )}

              {isCancelled && (
                <div className="mx-5 mt-4 p-3 bg-red-500/10 rounded-lg border border-red-500/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-600 dark:text-red-400">Cannot mark attendance for a cancelled session.</p>
                </div>
              )}

              {/* Trainee rows */}
              {sheet.trainees.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">{t('noTraineesInGroup')}</p>
              ) : (
                <div className="divide-y divide-slate-900/10 dark:divide-white/5">
                  {sheet.trainees.map((tr) => (
                    <div
                      key={tr.traineeId}
                      className={`px-5 py-4 ${tr.subscriptionEnded ? 'opacity-50' : ''}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{tr.name}</p>
                            <p className="text-xs text-slate-500">{tr.systemCode}</p>
                          </div>
                          {tr.activeSubscription && (
                            <span className="ms-auto sm:ms-0 text-xs text-slate-500 shrink-0">
                              {tr.activeSubscription.attendedSessions}/{tr.activeSubscription.totalSessions}
                            </span>
                          )}
                        </div>

                        {isCancelled ? null : tr.canMark ? (
                          <StatusToggle
                            value={attendanceMap[tr.traineeId] ?? null}
                            onChange={(s) =>
                              setAttendanceMap((prev) => ({ ...prev, [tr.traineeId]: s }))
                            }
                          />
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 shrink-0 whitespace-nowrap">
                            {t('subscriptionExpired')}
                          </span>
                        )}
                      </div>

                      {/* Notes field (shown when ABSENT/EXCUSED) — not for ended subs */}
                      {!isCancelled &&
                        tr.canMark &&
                        (attendanceMap[tr.traineeId] === 'ABSENT' ||
                          attendanceMap[tr.traineeId] === 'EXCUSED') && (
                          <input
                            type="text"
                            value={notesMap[tr.traineeId] ?? ''}
                            onChange={(e) =>
                              setNotesMap((prev) => ({ ...prev, [tr.traineeId]: e.target.value }))
                            }
                            placeholder={t('notes') + '...'}
                            className="mt-2 w-full bg-slate-900/5 dark:bg-white/5 border border-slate-900/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 sm:ms-11"
                          />
                        )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submit */}
              {!isCancelled && sheet.trainees.length > 0 && (
                <div className="px-5 py-4 border-t border-slate-900/10 dark:border-white/10">
                  {submitError && (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm mb-3 p-2 bg-red-500/10 rounded-lg">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                  {submitSuccess && (
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm mb-3 p-2 bg-emerald-500/10 rounded-lg">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{t('alreadySubmitted')}</span>
                    </div>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold transition disabled:opacity-50"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {t('submitAttendance')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
