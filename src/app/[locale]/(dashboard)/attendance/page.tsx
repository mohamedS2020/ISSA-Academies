'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
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

const STATUS_CONFIG: Record<AttendanceStatus, { icon: any; class: string }> = {
  PRESENT: {
    icon: CheckCircle2,
    class: 'bg-success-soft text-success border-success/40',
  },
  ABSENT: {
    icon: XCircle,
    class: 'bg-danger-soft text-danger border-danger/40',
  },
  EXCUSED: {
    icon: MinusCircle,
    class: 'bg-warning-soft text-warning border-warning/40',
  },
};

function StatusToggle({
  value,
  onChange,
}: {
  value: AttendanceStatus | null;
  onChange: (s: AttendanceStatus) => void;
}) {
  const t = useTranslations('attendance');
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
                : 'bg-foreground/5 border-foreground/10 text-muted-foreground hover:text-foreground/80'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t(s.toLowerCase() as 'present' | 'absent' | 'excused')}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────

function AttendancePageContent() {
  const t = useTranslations('attendance');
  const tCommon = useTranslations('common');
  const tSchedule = useTranslations('schedule');
  // Session statuses arrive as enum values (SCHEDULED, COMPLETED, CANCELLED).
  const statusText = (status: string) =>
    tSchedule.has(status.toLowerCase()) ? tSchedule(status.toLowerCase()) : status;
  const { authFetch } = useAuth();
  const can = useAccess();
  // "View attendance" opens the sheet read-only; marking needs "Mark attendance".
  const canMarkAttendance = can('markAttendance');
  const statusLabel: Record<AttendanceStatus, string> = {
    PRESENT: t('present'),
    ABSENT: t('absent'),
    EXCUSED: t('excused'),
  };

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
      if (!res.ok) throw new Error(data.error?.message ?? t('submitFailed'));
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


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-card to-background p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          {t('title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('markAttendance')}</p>
      </div>

      {/* Step 1 — Session Selector */}
      <div className="bg-foreground/5 border border-foreground/10 rounded-2xl p-5 mb-5">
        <label htmlFor="attendance-session" className="block text-sm font-semibold text-foreground/80 mb-3">
          {t('selectSession')}
        </label>

        {loadingSessions ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('loadingSessions')}</span>
          </div>
        ) : todaySessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noSessions')}</p>
        ) : (
          <div className="space-y-3">
            {/* Filters — narrow the list by captain and/or start hour */}
            {(captainOptions.length > 1 || hourOptions.length > 1) && (
              <div className="flex flex-wrap gap-3">
                {captainOptions.length > 1 && (
                  <div className="relative flex-1 min-w-[160px]">
                    <Award className="absolute start-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <select
                      aria-label={t('filterByCaptain')}
                      value={filterCaptain}
                      onChange={(e) => setFilterCaptain(e.target.value)}
                      className="w-full appearance-none bg-foreground/5 border border-foreground/10 rounded-xl ps-9 pe-8 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">{t('allCaptains')}</option>
                      {captainOptions.map((c) => (
                        <option key={c} value={c} className="bg-muted">{c}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute end-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
                {hourOptions.length > 1 && (
                  <div className="relative flex-1 min-w-[120px]">
                    <Clock className="absolute start-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <select
                      aria-label={t('filterByHour')}
                      value={filterHour}
                      onChange={(e) => setFilterHour(e.target.value)}
                      className="w-full appearance-none bg-foreground/5 border border-foreground/10 rounded-xl ps-9 pe-8 py-2.5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">{t('allHours')}</option>
                      {hourOptions.map((h) => (
                        <option key={h} value={h} className="bg-muted">{h}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute end-3 top-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                )}
              </div>
            )}

            {/* Session picker (filtered) */}
            <div className="relative">
              <select
                id="attendance-session"
                value={selectedSessionId ?? ''}
                onChange={(e) => setSelectedSessionId(e.target.value || null)}
                className="w-full appearance-none bg-foreground/5 border border-foreground/10 rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring pe-10"
              >
                <option value="">{t('selectSession')}...</option>
                {filteredSessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-muted">
                    {/* scheduledAtLocal is branch-local "DD/MM/YYYY, HH:MM" — take the time part */}
                    {s.group.name} — {sessionTime(s)}
                    {sessionCaptain(s) ? ` · ${sessionCaptain(s)}` : ''} [{statusText(s.status)}]
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute end-3 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
            {filteredSessions.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('noSessionsMatch')}</p>
            )}
          </div>
        )}
      </div>

      {/* Step 2 — Attendance Sheet */}
      {selectedSessionId && (
        <div className="bg-foreground/5 border border-foreground/10 rounded-2xl overflow-hidden">
          {loadingSheet ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : !sheet ? null : (
            <>
              {/* Session info strip */}
              <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{sheet.session.groupName}</p>
                  <p className="text-xs text-muted-foreground">
                    <span dir="ltr">{sheet.session.scheduledAtLocal ?? format(parseISO(sheet.session.scheduledAt), 'dd/MM/yyyy, HH:mm')}</span> · {tCommon('minutes', { count: sheet.session.durationMinutes })}
                  </p>
                </div>
                <span
                  className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    sheet.session.status === 'COMPLETED'
                      ? 'bg-success-soft text-success'
                      : sheet.session.status === 'CANCELLED'
                      ? 'bg-danger-soft text-danger'
                      : 'bg-primary/10 text-primary dark:text-primary'
                  }`}
                >
                  {statusText(sheet.session.status)}
                </span>
              </div>

              {/* Quick actions + live tally */}
              {!isCancelled && sheet.trainees.length > 0 && (
                <div className="px-5 py-3 border-b border-foreground/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                    <span className="px-2 py-1 rounded-full bg-success-soft text-success">
                      {counts.PRESENT} {t('present')}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-danger-soft text-danger">
                      {counts.ABSENT} {t('absent')}
                    </span>
                    <span className="px-2 py-1 rounded-full bg-warning-soft text-warning">
                      {counts.EXCUSED} {t('excused')}
                    </span>
                    {counts.unmarked > 0 && (
                      <span className="px-2 py-1 rounded-full bg-foreground/5 text-muted-foreground">
                        {counts.unmarked} {t('unmarked')}
                      </span>
                    )}
                  </div>
                  {canMarkAttendance && (
                  <button
                    onClick={() => markAll('PRESENT')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/80 hover:bg-success/90 text-success-foreground text-xs font-semibold transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('markAllPresent')}
                  </button>
                  )}
                </div>
              )}

              {isCancelled && (
                <div className="mx-5 mt-4 p-3 bg-danger-soft rounded-lg border border-danger/20 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                  <p className="text-sm text-danger">{t('cancelledSession')}</p>
                </div>
              )}

              {/* Trainee rows */}
              {sheet.trainees.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-10">{t('noTraineesInGroup')}</p>
              ) : (
                <div className="divide-y divide-foreground/10">
                  {sheet.trainees.map((tr) => (
                    <div
                      key={tr.traineeId}
                      className={`px-5 py-4 ${tr.subscriptionEnded ? 'opacity-50' : ''}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{tr.name}</p>
                            <p className="text-xs text-muted-foreground">{tr.systemCode}</p>
                          </div>
                          {tr.activeSubscription && (
                            <span className="ms-auto sm:ms-0 text-xs text-muted-foreground shrink-0">
                              {tr.activeSubscription.attendedSessions}/{tr.activeSubscription.totalSessions}
                            </span>
                          )}
                        </div>

                        {isCancelled ? null : !canMarkAttendance ? (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-foreground/80 border border-border shrink-0 whitespace-nowrap">
                            {attendanceMap[tr.traineeId]
                              ? statusLabel[attendanceMap[tr.traineeId]!]
                              : t('unmarked')}
                          </span>
                        ) : tr.canMark ? (
                          <StatusToggle
                            value={attendanceMap[tr.traineeId] ?? null}
                            onChange={(s) =>
                              setAttendanceMap((prev) => ({ ...prev, [tr.traineeId]: s }))
                            }
                          />
                        ) : (
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-warning-soft text-warning border border-warning/30 shrink-0 whitespace-nowrap">
                            {t('subscriptionExpired')}
                          </span>
                        )}
                      </div>

                      {/* Notes field (shown when ABSENT/EXCUSED) — not for ended subs */}
                      {!isCancelled &&
                        canMarkAttendance &&
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
                            className="mt-2 w-full bg-foreground/5 border border-foreground/10 rounded-lg px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring sm:ms-11"
                          />
                        )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submit */}
              {!isCancelled && canMarkAttendance && sheet.trainees.length > 0 && (
                <div className="px-5 py-4 border-t border-foreground/10">
                  {submitError && (
                    <div className="flex items-center gap-2 text-danger text-sm mb-3 p-2 bg-danger-soft rounded-lg">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                  {submitSuccess && (
                    <div className="flex items-center gap-2 text-success text-sm mb-3 p-2 bg-success-soft rounded-lg">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{t('alreadySubmitted')}</span>
                    </div>
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition disabled:opacity-50"
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

export default function AttendancePage() {
  return (
    <RequireAccess access="viewAttendance">
      <AttendancePageContent />
    </RequireAccess>
  );
}
