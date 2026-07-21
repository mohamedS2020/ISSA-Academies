'use client';

/**
 * ISSA — Group Detail Page
 *
 * Shows: captain card, plan info, trainee table (with active sub status),
 * upcoming sessions list, and remove-trainee action.
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { UserRole } from '@/types';
import {
  Users2, Award, CreditCard, Calendar, Clock,
  ChevronLeft, Trash2, Loader2, CheckCircle, XCircle, Pencil, MessageSquare, Eye,
} from 'lucide-react';
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
  sessions: { id: string; scheduledAt: string; status: string; durationMinutes: number }[];
  _count: { trainees: number; sessions: number };
}

const DAY_SHORT: Record<string, string> = {
  MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed',
  THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun',
};

// ─── Component ────────────────────────────────────────────────

export default function GroupDetailPage() {
  const t = useTranslations('groups');
  const tCommon = useTranslations('common');
  const tFeedback = useTranslations('feedback');
  const { user, authFetch } = useAuth();
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
      if (!res.ok) throw new Error('Failed to load group');
      const data = await res.json();
      setGroup(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, groupId, toast]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  const handleRemoveTrainee = async (traineeId: string, traineeName: string) => {
    if (!confirm(`Remove ${traineeName} from this group?`)) return;
    setRemovingId(traineeId);
    try {
      const res = await authFetch(`/api/groups/${groupId}/trainees/${traineeId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove trainee');
      toast.success('Trainee removed from group');
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

  const isAdmin = user?.role === UserRole.ADMIN;
  // Captains must not see trainee PII (phone / system code) or the plan price.
  // The API already redacts these, so the fields arrive undefined; we also
  // hide the UI affordances so nothing renders empty.
  const isCaptain = user?.role === UserRole.CAPTAIN;
  // Only staff who may see trainee PII can open the trainee detail page.
  const canViewTrainee =
    user?.role === UserRole.ADMIN || user?.role === UserRole.MODERATOR;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Back + Title + Edit */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/groups`)}
            className="p-2 rounded-lg border border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-400 dark:hover:border-slate-500 transition-all"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500/20 to-accent/20 border border-teal-500/30">
              <Users2 className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{group.name}</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {group._count.trainees}/{group.maxTrainees} trainees · {group._count.sessions} sessions total
              </p>
            </div>
          </div>
        </div>

        {isAdmin && (
          <button
            onClick={() => router.push(`/${locale}/groups/${groupId}/edit`)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-accent text-white text-sm font-semibold hover:shadow-lg hover:shadow-teal-500/25 transition-all flex-shrink-0"
          >
            <Pencil className="w-4 h-4" />
            {t('editGroup')}
          </button>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Captain card */}
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-primary dark:text-primary" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('captain')}</span>
          </div>
          <p className="font-semibold text-slate-900 dark:text-white">{group.captain.user.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{group.captain.user.phoneNumber}</p>
          {group.captain.specialization && (
            <p className="text-xs text-primary dark:text-primary mt-1">{group.captain.specialization}</p>
          )}
        </div>

        {/* Plan card */}
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('plan')}</span>
          </div>
          <p className="font-semibold text-slate-900 dark:text-white">{group.plan.name}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{group.plan.minSessions} sessions</p>
          {group.plan.amount != null && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{Number(group.plan.amount).toLocaleString()} EGP</p>
          )}
        </div>

        {/* Schedule card */}
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{t('schedule')}</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-2">
            {group.scheduleDays.map((day) => (
              <span key={day} className="px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 rounded text-xs">
                {DAY_SHORT[day] ?? day}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <Clock className="w-3 h-3" />
            {group.startTime} · {group.sessionDuration}min
          </div>
        </div>
      </div>

      {/* Upcoming sessions */}
      {group.sessions.length > 0 && (
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Upcoming Sessions</h2>
          <div className="space-y-2">
            {group.sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-300/40 dark:border-slate-700/40 last:border-0">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {new Date(s.scheduledAt).toLocaleDateString()} at {new Date(s.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <span className="text-xs text-slate-500">{s.durationMinutes}min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trainees table */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-300/60 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Trainees ({group._count.trainees}/{group.maxTrainees})
          </h2>
        </div>
        {group.trainees.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No trainees assigned yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300/60 dark:border-slate-700/60">
                  {[...(isCaptain ? [] : ['Code']), 'Name', ...(isCaptain ? [] : ['Phone']), 'Subscription', tCommon('actions')].map((h) => (
                    <th key={h} className="px-4 py-3 text-start text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.trainees.map(({ id: gtId, trainee }) => {
                  const sub = trainee.subscriptions[0];
                  return (
                    <tr key={gtId} className="border-b border-slate-300/30 dark:border-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors">
                      {!isCaptain && (
                        <td className="px-4 py-3 font-mono text-xs text-primary dark:text-primary">{trainee.systemCode}</td>
                      )}
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{trainee.name}</td>
                      {!isCaptain && (
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{trainee.user.phoneNumber}</td>
                      )}
                      <td className="px-4 py-3">
                        {sub ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                              sub.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
                            }`}>
                              {sub.status === 'ACTIVE' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {sub.status}
                            </span>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {sub.attendedSessions}/{sub.totalSessions} sessions
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No subscription</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {canViewTrainee && (
                            <button
                              onClick={() => router.push(`/${locale}/trainees/${trainee.id}`)}
                              className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-300/60 dark:border-slate-600/60 hover:border-primary/60 hover:text-primary dark:hover:text-primary hover:bg-primary/10 transition-all"
                              title={t('viewTrainee')}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setFeedbackFor({ id: trainee.id, name: trainee.name })}
                            className="p-1.5 rounded-lg text-primary dark:text-primary border border-primary/20 hover:bg-primary/10 transition-all"
                            title={tFeedback('open')}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => handleRemoveTrainee(trainee.id, trainee.name)}
                              disabled={removingId === trainee.id}
                              className="p-1.5 rounded-lg text-red-600 dark:text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-all disabled:opacity-50"
                            >
                              {removingId === trainee.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Feedback modal (captain writes, staff view) ─── */}
      {feedbackFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md px-4"
          onClick={() => setFeedbackFor(null)}
        >
          <div
            className="w-full max-w-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary dark:text-primary" />
                {tFeedback('forTrainee', { name: feedbackFor.name })}
              </h2>
              <button
                onClick={() => setFeedbackFor(null)}
                className="h-7 w-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
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
