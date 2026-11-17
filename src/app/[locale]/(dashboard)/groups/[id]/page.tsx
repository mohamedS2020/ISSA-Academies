'use client';

/**
 * Group Detail Page
 *
 * Shows: captain card, plan info, trainee table (with active sub status),
 * upcoming sessions list, and remove-trainee action.
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
import { useConfirm } from '@/components/feedback/use-confirm';
import {
  Users2, Award, CreditCard, Calendar, Clock,
  ChevronLeft, Trash2, Loader2, CheckCircle, XCircle, Pencil, MessageSquare, Eye,
} from 'lucide-react';
import { formatBranchDateTime, formatNumber } from '@/lib/i18n/format';
import { FeedbackPanel } from '@/components/rating/feedback-panel';

// ─── Types ────────────────────────────────────────────────────

interface GroupDetail {
  id: string;
  name: string;
  startTime: string;
  sessionDuration: number;
  scheduleDays: string[];
  maxTrainees: number;
  minTrainees: number;
  isActive: boolean;
  captain: {
    id: string; specialization: string | null;
    user: { name: string; phoneNumber: string };
  };
  plan: { id: string; name: string; amount?: string; minSessions: number; periodType: string };
  trainees: {
    id: string; joinedAt: string;
    trainee: {
      id: string; name: string; systemCode?: string;
      user: { name: string; phoneNumber?: string };
      subscriptions: { status: string; endDate: string; attendedSessions: number; totalSessions: number }[];
    };
  }[];
  sessions: { id: string; scheduledAt: string; scheduledAtLocal: string; status: string; durationMinutes: number }[];
  _count: { trainees: number; sessions: number };
}

// ─── Component ────────────────────────────────────────────────

function GroupDetailPageContent() {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const tFeedback = useTranslations('feedback');
  const tg = useTranslations('groupPage');
  const [ask, confirmDialog] = useConfirm();
  const tSubs = useTranslations('subscriptions');
  const tRenewal = useTranslations('renewal');
  const tDay = useTranslations('daysShort');
  const { user, authFetch } = useAuth();
  const can = useAccess();
  const { toast } = useToast();
  const router = useRouter();
  const routeParams = useParams();
  const locale = routeParams.locale as string;
  const groupId = routeParams.id as string;

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<{ id: string; name: string } | null>(null);

  const fetchGroup = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/groups/${groupId}`);
      if (!res.ok) throw new Error(tCommon('loadFailed'));
      const data = await res.json();
      setGroup(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, groupId, toast, tCommon]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  const handleRemoveTrainee = async (traineeId: string, traineeName: string) => {
    if (!(await ask({ title: tg('removeTitle'), message: tg('removeConfirm', { name: traineeName }), confirmLabel: tg('remove') }))) return;
    setRemovingId(traineeId);
    try {
      const res = await authFetch(`/api/groups/${groupId}/trainees/${traineeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(tg('removeFailed'));
      toast.success(tg('removed'));
      fetchGroup();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary dark:text-primary" />
      </div>
    );
  }

  if (!group) return null;

  // Editing the group and removing a trainee are "Manage groups" (access.ts).
  const canManageGroup = can('manageGroups');
  // Captains must not see trainee PII (phone / system code) or the plan price.
  // The API already redacts these, so the fields arrive undefined; we also
  // hide the UI affordances so nothing renders empty.
  const isCaptain = user?.role === UserRole.CAPTAIN;
  // Only staff who may see trainee PII can open the trainee detail page, or read
  // the trainee's feedback (captains read their own trainees' feedback).
  const canViewTrainee = can('viewTrainees');

  // One trainee's subscription badge and sessions, for the table and the phone cards.
  const subscriptionCell = (sub: GroupDetail['trainees'][number]['trainee']['subscriptions'][number] | undefined) =>
    sub ? (
      <div>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
          sub.status === 'ACTIVE' ? 'bg-success-soft text-success border border-success/30' : 'bg-muted/70 text-muted-foreground border border-input/30'
        }`}>
          {sub.status === 'ACTIVE' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {sub.status === 'ACTIVE' ? tSubs('active') : sub.status === 'FROZEN' ? tSubs('frozen') : tSubs('expired')}
        </span>
        <p className="text-xs text-muted-foreground mt-0.5">
          {tg('attended', { attended: sub.attendedSessions, total: sub.totalSessions })}
        </p>
      </div>
    ) : (
      <span className="text-xs text-muted-foreground">{tg('noSubscription')}</span>
    );

  // View / feedback / remove for one trainee. `large`: 44 px buttons in a
  // full-width row for the phone cards; the table keeps its compact icons.
  const traineeActions = (
    trainee: GroupDetail['trainees'][number]['trainee'],
    large: boolean
  ) => (
      <div className={`flex items-center gap-2 ${large ? "[&_button]:h-11 [&_button]:flex-1 [&_button]:flex [&_button]:items-center [&_button]:justify-center" : ""}`}>
        {canViewTrainee && (
          <button
            onClick={() => router.push(`/${locale}/trainees/${trainee.id}`)}
            className="p-1.5 rounded-lg text-foreground/80 border border-input/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all"
            title={t('viewTrainee')}
            aria-label={t('viewTrainee')}
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        {(isCaptain || canViewTrainee) && (
        <button
          onClick={() => setFeedbackFor({ id: trainee.id, name: trainee.name })}
          className="p-1.5 rounded-lg text-primary dark:text-primary border border-primary/20 hover:bg-primary/10 transition-all"
          title={tFeedback('open')}
          aria-label={tFeedback('open')}
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </button>
        )}
        {canManageGroup && (
          <button
            onClick={() => handleRemoveTrainee(trainee.id, trainee.name)}
            disabled={removingId === trainee.id}
            aria-label={tCommon('delete')}
            title={tCommon('delete')}
            className="p-1.5 rounded-lg text-danger border border-danger/20 hover:bg-danger-soft transition-all disabled:opacity-50"
          >
            {removingId === trainee.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
  );

  return (
    <div className="space-y-6 max-w-5xl">
      {confirmDialog}
      {/* Back + Title + Edit. On phones the button moves under the title: side
          by side it squeezed the group name into one word per line. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/${locale}/groups`)}
            aria-label={tCommon('back')}
            className="flex-shrink-0 flex items-center justify-center h-11 w-11 sm:h-auto sm:w-auto sm:p-2 rounded-lg border border-input/60 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
          >
            <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3 min-w-0">
            <div className="hidden sm:block p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
              <Users2 className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground break-words">{group.name}</h1>
              <p className="text-sm text-muted-foreground">
                {tg('summary', { count: group._count.trainees, max: group.maxTrainees, sessions: group._count.sessions })}
              </p>
            </div>
          </div>
        </div>

        {canManageGroup && (
          <button
            onClick={() => router.push(`/${locale}/groups/${groupId}/edit`)}
            className="flex items-center justify-center gap-1.5 min-h-11 sm:min-h-0 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/25 transition-all flex-shrink-0 w-full sm:w-auto"
          >
            <Pencil className="w-4 h-4" />
            {t('editGroup')}
          </button>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Captain card */}
        <div className="bg-card/80 border border-input/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-primary dark:text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('captain')}</span>
          </div>
          <p className="font-semibold text-foreground">{group.captain.user.name}</p>
          <p className="text-xs text-muted-foreground mt-1 rtl:text-right" dir="ltr">{group.captain.user.phoneNumber}</p>
          {group.captain.specialization && (
            <p className="text-xs text-primary dark:text-primary mt-1">{group.captain.specialization}</p>
          )}
        </div>

        {/* Plan card */}
        <div className="bg-card/80 border border-input/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('plan')}</span>
          </div>
          <p className="font-semibold text-foreground">{group.plan.name}</p>
          <p className="text-xs text-muted-foreground mt-1">{tRenewal('sessions', { count: group.plan.minSessions })}</p>
          {group.plan.amount != null && (
            <p className="text-xs text-success mt-1">{formatNumber(Number(group.plan.amount), locale)} {tRenewal('currency')}</p>
          )}
        </div>

        {/* Schedule card */}
        <div className="bg-card/80 border border-input/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-warning" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('schedule')}</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {group.scheduleDays.map((day) => (
              <span key={day} className="px-1.5 py-0.5 bg-warning-soft text-warning border border-warning/30 rounded text-xs">
                {tDay(day.toLowerCase())}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span dir="ltr">{group.startTime}</span> · {t('minutes', { count: group.sessionDuration })}
          </div>
        </div>
      </div>

      {/* Upcoming sessions */}
      {group.sessions.length > 0 && (
        <div className="bg-card/80 border border-input/60 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-foreground/80 mb-3">{tg('upcomingSessions')}</h2>
          <div className="space-y-2">
            {group.sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-input/40 last:border-0">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground/80">
                    {formatBranchDateTime(s.scheduledAtLocal, locale)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{t('minutes', { count: s.durationMinutes })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trainees table */}
      <div className="bg-card/80 border border-input/60 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-input/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/80">
            {tg('traineesTitle', { count: group._count.trainees, max: group.maxTrainees })}
          </h2>
        </div>
        {group.trainees.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{tg('noTrainees')}</div>
        ) : (
          <>
          {/* Phones: one card per trainee. The table hid the subscription and
              the action buttons off the screen's edge. */}
          <ul className="md:hidden divide-y divide-input/30">
            {group.trainees.map(({ id: gtId, trainee }) => (
              <li key={gtId} className="p-4">
                <p className="font-medium text-foreground break-words">{trainee.name}</p>
                {!isCaptain && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <span className="font-mono text-primary">{trainee.systemCode}</span>
                    <span> · </span>
                    <span dir="ltr">{trainee.user.phoneNumber}</span>
                  </p>
                )}
                <div className="mt-2">{subscriptionCell(trainee.subscriptions[0])}</div>
                <div className="mt-3">{traineeActions(trainee, true)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-input/60">
                  {[...(isCaptain ? [] : [tg('code')]), tg('name'), ...(isCaptain ? [] : [tg('phone')]), tg('subscription'), tCommon('actions')].map((h) => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.trainees.map(({ id: gtId, trainee }) => {
                  return (
                    <tr key={gtId} className="border-b border-input/30 hover:bg-muted transition-colors">
                      {!isCaptain && (
                        <td className="px-4 py-3 font-mono text-xs text-primary dark:text-primary">{trainee.systemCode}</td>
                      )}
                      <td className="px-4 py-3 font-medium text-foreground">{trainee.name}</td>
                      {!isCaptain && (
                        <td className="px-4 py-3 text-muted-foreground text-xs" dir="ltr">{trainee.user.phoneNumber}</td>
                      )}
                      <td className="px-4 py-3">
                        {subscriptionCell(trainee.subscriptions[0])}
                      </td>
                      <td className="px-4 py-3">
                        {traineeActions(trainee, false)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* ─── Feedback modal (captain writes, staff view) ─── */}
      {feedbackFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4"
          onClick={() => setFeedbackFor(null)}
        >
          <div
            className="w-full max-w-lg bg-background border border-border rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary dark:text-primary" />
                {tFeedback('forTrainee', { name: feedbackFor.name })}
              </h2>
              <button
                onClick={() => setFeedbackFor(null)}
                className="h-10 w-10 sm:h-7 sm:w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                &times;
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <FeedbackPanel traineeId={feedbackFor.id} canWrite={isCaptain} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GroupDetailPage() {
  return (
    <RequireAccess access="viewGroups" allowRoles={[UserRole.CAPTAIN]}>
      <GroupDetailPageContent />
    </RequireAccess>
  );
}
