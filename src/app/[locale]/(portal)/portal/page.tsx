'use client';

/**
 * Portal Dashboard (FR-TP-02, FR-TP-04)
 *
 * Welcome message, upcoming sessions, subscription status summary,
 * quick links. Fully live data — no mock values.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { usePortalTrainee } from '../portal-trainee-context';
import { SkeletonDashboard } from '@/components/feedback/skeleton-loader';
import { StarRating, RatingBadge } from '@/components/rating/star-rating';
import {
  Sparkles,
  Calendar,
  CreditCard,
  UserCheck,
  Receipt,
  Clock,
  Star,
  MessageSquare,
} from 'lucide-react';

interface CaptainRating {
  captain: { id: string; name: string } | null;
  myStars: number | null;
  average: number | null;
  count: number;
}

interface FeedbackEntry {
  id: string;
  message: string;
  createdAt: string;
  captain: { user: { name: string } };
}

interface DashboardData {
  trainee: { name: string; systemCode: string };
  activeSubscription: {
    status: string;
    endDate: string;
    totalSessions: number;
    attendedSessions: number;
    plan: { name: string };
    level: { name: string };
  } | null;
  upcomingSessions: {
    id: string;
    scheduledAtLocal: string;
    durationMinutes: number;
    group: { name: string; captain: { user: { name: string } } };
  }[];
}

export default function PortalDashboardPage() {
  const t = useTranslations('portal');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const locale = params.locale as string;

  const { selectedTraineeId } = usePortalTrainee();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rating, setRating] = useState<CaptainRating | null>(null);
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);

  const traineeQuery = selectedTraineeId ? `?traineeId=${selectedTraineeId}` : '';

  const fetchDashboard = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/portal/dashboard${selectedTraineeId ? `?traineeId=${selectedTraineeId}` : ''}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon, selectedTraineeId]);

  // Captain rating widget + feedback list (non-fatal — never block the dashboard).
  const fetchRatingAndFeedback = useCallback(async () => {
    const q = selectedTraineeId ? `?traineeId=${selectedTraineeId}` : '';
    try {
      const [rRes, fRes] = await Promise.all([
        authFetch(`/api/portal/captain-rating${q}`),
        authFetch(`/api/portal/feedback${q}`),
      ]);
      if (rRes.ok) setRating((await rRes.json()).data);
      if (fRes.ok) setFeedback((await fRes.json()).data ?? []);
    } catch {
      /* non-fatal */
    }
  }, [authFetch, selectedTraineeId]);

  useEffect(() => {
    fetchDashboard();
    fetchRatingAndFeedback();
  }, [fetchDashboard, fetchRatingAndFeedback]);

  const handleRate = async (stars: number) => {
    try {
      const res = await authFetch(`/api/portal/captain-rating${traineeQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars }),
      });
      if (!res.ok) throw new Error('Failed to save rating');
      setRating((await res.json()).data);
      toast.success(t('ratingSaved'));
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    }
  };

  if (isLoading || !data) {
    return <SkeletonDashboard />;
  }

  const quickLinks = [
    { label: t('schedule'), href: `/${locale}/portal/schedule`, icon: Calendar },
    { label: t('attendance'), href: `/${locale}/portal/attendance`, icon: UserCheck },
    { label: t('subscription'), href: `/${locale}/portal/subscription`, icon: CreditCard },
    { label: t('receipts'), href: `/${locale}/portal/receipts`, icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Welcome Hero ─── */}
      <div className="rounded-2xl bg-gradient-to-r from-card/80 to-accent/20 border border-border p-6 shadow-xl">
        <h2 className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <Sparkles size={20} className="text-primary dark:text-primary" />
          {t('welcome', { name: data.trainee.name })}
        </h2>
        <p className="text-xs text-muted-foreground mt-1 font-mono">{data.trainee.systemCode}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ─── Upcoming Sessions ─── */}
        <div className="lg:col-span-2 rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
            <Calendar size={16} className="text-primary dark:text-primary" />
            {t('upcomingSessions')}
          </h3>

          {data.upcomingSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">{t('noUpcoming')}</p>
          ) : (
            <div className="space-y-3">
              {data.upcomingSessions.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl bg-background border border-border flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-foreground">{s.group.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {s.group.captain.user.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-primary dark:text-primary bg-primary/10 px-2.5 py-1 rounded-full flex-shrink-0">
                    <Clock size={11} />
                    {s.scheduledAtLocal}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Subscription Summary ─── */}
        <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={16} className="text-primary dark:text-primary" />
              {t('subscription')}
            </h3>

            {data.activeSubscription ? (
              <div className="space-y-3 text-xs leading-relaxed text-foreground/80">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{t('planName')}</span>
                  <span className="font-semibold text-foreground">
                    {data.activeSubscription.plan.name}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">{t('sessionsRemaining')}</span>
                  <span className="font-semibold text-foreground">
                    {data.activeSubscription.totalSessions -
                      data.activeSubscription.attendedSessions}{' '}
                    / {data.activeSubscription.totalSessions}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('expiresOn')}</span>
                  <span className="font-semibold text-warning font-mono">
                    {new Date(data.activeSubscription.endDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('noActiveSubscription')}</p>
            )}
          </div>

          <div className="border-t border-border pt-4 mt-6 grid grid-cols-2 gap-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="p-3 rounded-xl bg-background border border-border hover:border-primary/50 hover:bg-card/70 transition-colors flex flex-col items-center gap-1.5 text-center"
                >
                  <Icon size={16} className="text-primary dark:text-primary" />
                  <span className="text-[10px] font-bold text-foreground/80">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Rate Your Captain + Feedback ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rate your captain */}
        <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <Star size={16} className="text-warning" />
            {t('rateCaptain')}
          </h3>

          {rating?.captain ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t('yourCaptain')}:{' '}
                <span className="font-semibold text-foreground">{rating.captain.name}</span>
              </p>
              <StarRating value={rating.myStars} onRate={handleRate} />
              <p className="text-[10px] text-muted-foreground">
                {rating.myStars ? t('tapToChange') : t('tapToRate')}
              </p>
              {rating.average !== null && (
                <div className="flex items-center gap-1.5 pt-3 border-t border-border text-[11px] text-muted-foreground">
                  {t('captainAverage')}:
                  <RatingBadge average={rating.average} count={rating.count} size={13} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('noCaptainYet')}</p>
          )}
        </div>

        {/* Feedback from your captain */}
        <div className="lg:col-span-2 rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <MessageSquare size={16} className="text-primary dark:text-primary" />
            {t('captainFeedback')}
          </h3>

          {feedback.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">{t('noFeedback')}</p>
          ) : (
            <div className="space-y-3">
              {feedback.map((f) => (
                <div key={f.id} className="p-3.5 rounded-xl bg-background border border-border">
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                    {f.message}
                  </p>
                  <div className="flex items-center justify-between mt-2.5 text-[10px] text-muted-foreground">
                    <span className="font-semibold">{f.captain.user.name}</span>
                    <span className="font-mono">
                      {new Date(f.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
