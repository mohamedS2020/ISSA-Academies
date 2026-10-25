'use client';

/**
 * Dynamic Dashboard Page
 *
 * Role-specific KPI dashboards powered by real data from /api/dashboard:
 *   - Admin / Moderator: KPI cards, activity trend chart, today's sessions,
 *     expiring-soon subscriptions list.
 *   - Captain: Group/trainee counts, today's session roster.
 *
 * TRAINEE role is explicitly not handled here — trainees are redirected to
 * /portal at login time and by the (dashboard)/layout.tsx guard.
 */

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { UserRole } from '@/types';
import { useToast } from '@/components/feedback/toast-provider';
import { SkeletonDashboard } from '@/components/feedback/skeleton-loader';
import {
  Users,
  CreditCard,
  DollarSign,
  AlertCircle,
  Calendar,
  Clock,
  ArrowUpRight,
  Activity,
  Award,
  Sparkles,
  UserCheck,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';

// recharts is heavy — load it only when the chart renders (keeps it out of the
// dashboard's initial bundle). ssr:false is fine: this page is client-only.
const AreaTrendChart = dynamic(
  () => import('@/components/charts/area-trend-chart'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[180px] w-full animate-pulse rounded-xl bg-muted/60" />
    ),
  }
);

// ─── Types ──────────────────────────────────────────────────

interface SessionRow {
  id: string;
  scheduledAtLocal: string;
  durationMinutes: number;
  status: string;
  group: { name: string; captain: { user: { name: string } } };
}

interface AdminDashboard {
  totalTrainees: number;
  newTraineesThisMonth: number;
  activeSubscriptions: number;
  newSubscriptionsThisMonth: number;
  // null: a section this moderator's permissions do not cover (not "zero").
  revenueThisMonth: number | null;
  outstandingBalances: number | null;
  todaySessions: SessionRow[] | null;
  expiringSoon:
    | {
        id: string;
        traineeName: string;
        phoneNumber: string;
        planName: string;
        endDate: string;
      }[]
    | null;
  activityTrend: { date: string; checkIns: number; renewals: number }[];
}

interface CaptainDashboard {
  myGroupsCount: number;
  myTraineesCount: number;
  todaySessions: SessionRow[];
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tSchedule = useTranslations('schedule');
  const tUsers = useTranslations('users');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const params = useParams();
  const locale = params.locale as string;
  const isRtl = locale === 'ar';

  // Cached via React Query — going back to the dashboard reuses fresh data
  // (staleTime) instead of refetching and flashing a skeleton every time.
  const {
    data: dashboardData,
    isPending,
    isError,
    error,
  } = useQuery<AdminDashboard | CaptainDashboard>({
    queryKey: ['dashboard'],
    enabled: !!user && user.role !== UserRole.TRAINEE,
    queryFn: async () => {
      const res = await authFetch('/api/dashboard');
      if (!res.ok) throw new Error(tCommon('loadFailed'));
      const json = await res.json();
      return json.data;
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error((error as Error)?.message || tCommon('somethingWentWrong'));
    }
  }, [isError, error, toast, tCommon]);

  if (!user) return null;

  // ─── ADMIN & MODERATOR DASHBOARD ─────────────────────────

  const renderAdminDashboard = () => {
    const data = dashboardData as AdminDashboard | null;

    if (isPending || !data) return <SkeletonDashboard />;

    const todaySessions = data.todaySessions;
    const expiringSoon = data.expiringSoon;

    const kpis = [
      {
        title: t('totalTrainees'),
        value: data.totalTrainees,
        badge: `+${data.newTraineesThisMonth} ${t('newThisMonth')}`,
        icon: Users,
        colorClass: 'bg-primary',
      },
      {
        title: t('activeSubscriptions'),
        value: data.activeSubscriptions,
        badge: `+${data.newSubscriptionsThisMonth} ${t('newThisMonth')}`,
        icon: CreditCard,
        colorClass: 'bg-accent',
      },
      ...(data.revenueThisMonth !== null
        ? [
            {
              title: t('revenueThisMonth'),
              value: data.revenueThisMonth.toFixed(2),
              badge: t('thisMonth'),
              icon: DollarSign,
              colorClass: 'bg-success',
            },
          ]
        : []),
      ...(data.outstandingBalances !== null
        ? [
            {
              title: t('outstandingBalances'),
              value: data.outstandingBalances.toFixed(2),
              badge: t('currentBalance'),
              icon: AlertCircle,
              colorClass: 'bg-warning',
            },
          ]
        : []),
    ];

    return (
      <div className="space-y-8 animate-fadeIn">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {kpis.map((kpi, idx) => {
            const Icon = kpi.icon;
            return (
              <div
                key={idx}
                className="relative overflow-hidden rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:border-primary/50 group"
              >
                <div className={`absolute top-0 bottom-0 start-0 w-1 ${kpi.colorClass}`} />
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {kpi.title}
                    </p>
                    <h3 className="text-3xl font-extrabold text-foreground tracking-tight">
                      {kpi.value}
                    </h3>
                    <span className="text-[10px] font-bold text-muted-foreground font-medium">
                      {kpi.badge}
                    </span>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-primary dark:text-primary shadow-md group-hover:border-primary/50 transition-colors">
                    <Icon size={18} className="text-primary dark:text-primary" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className={`${todaySessions ? 'lg:col-span-2' : 'lg:col-span-3'} rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl flex flex-col`}>
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                  <Activity className="text-primary dark:text-primary" size={16} />
                  <span>{t('activityTrend')}</span>
                </h3>
                <span className="text-[10px] font-bold text-primary dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  7 {t('days')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-6">{t('checkInsAndRenewals')}</p>
            </div>

            {data.activityTrend.some((d) => d.checkIns > 0 || d.renewals > 0) ? (
              <AreaTrendChart
                data={data.activityTrend}
                height={180}
                fontSize={9}
                allowDecimals={false}
                series={[
                  { dataKey: 'checkIns', name: t('checkIns') },
                  { dataKey: 'renewals', name: t('renewals') },
                ]}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center h-40">
                <p className="text-xs text-muted-foreground">{tCommon('noResults')}</p>
              </div>
            )}
          </div>

          {todaySessions && (
          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock className="text-primary dark:text-primary" size={16} />
                <span>{t('todaySessions')}</span>
              </h3>
              <Link
                href={`/${locale}/schedule`}
                className="text-[10px] font-bold text-primary dark:text-primary hover:text-primary dark:hover:text-primary transition-colors uppercase flex items-center gap-0.5"
              >
                <span>{tCommon('all')}</span>
                {isRtl ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
              </Link>
            </div>

            {todaySessions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{tCommon('noResults')}</p>
            ) : (
              <div className="flex-1 space-y-4">
                {todaySessions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-background border border-border hover:border-primary/50 transition-colors flex flex-col gap-2 relative group"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold text-foreground group-hover:text-primary dark:group-hover:text-primary transition-colors truncate max-w-[160px]">
                        {s.group.name}
                      </span>
                      <span dir="ltr" className="text-[10px] font-mono text-primary dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
                        {s.scheduledAtLocal}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground font-medium">
                      {s.group.captain.user.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}
        </div>

        {expiringSoon && (
        <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              <CreditCard className="text-warning" size={16} />
              <span>{t('expiringSoon')}</span>
            </h3>
            <span className="text-[10px] font-bold text-warning bg-warning-soft px-2 py-0.5 rounded-full uppercase tracking-wider">
              7 {t('days')}
            </span>
          </div>

          {expiringSoon.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{tCommon('noResults')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-bold uppercase tracking-wider">
                    <th className="pb-3 text-start">{t('trainee')}</th>
                    <th className="pb-3 text-start">{t('plan')}</th>
                    <th className="pb-3 text-start">{t('expiry')}</th>
                    <th className="pb-3 text-start">{t('phone')}</th>
                    <th className="pb-3 text-end">{tCommon('actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {expiringSoon.map((item) => (
                    <tr key={item.id} className="text-foreground/80 group">
                      <td className="py-3.5 font-semibold text-foreground group-hover:text-primary dark:group-hover:text-primary transition-colors">
                        {item.traineeName}
                      </td>
                      <td className="py-3.5 text-muted-foreground">{item.planName}</td>
                      <td className="py-3.5 text-warning font-medium font-mono">
                        {new Date(item.endDate).toLocaleDateString()}
                      </td>
                      <td dir="ltr" className="py-3.5 text-muted-foreground font-mono rtl:text-right">{item.phoneNumber}</td>
                      <td className="py-3.5 text-end">
                        <Link
                          href={`/${locale}/subscriptions`}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-primary dark:text-primary hover:underline uppercase"
                        >
                          <span>{t('renew')}</span>
                          <ArrowUpRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
    );
  };

  // ─── CAPTAIN DASHBOARD ──────────────────────────────────────

  const renderCaptainDashboard = () => {
    const data = dashboardData as CaptainDashboard | null;

    if (isPending || !data) return <SkeletonDashboard />;

    const stats = [
      {
        title: t('myGroups'),
        value: data.myGroupsCount,
        desc: t('assignedGroups'),
        icon: Award,
      },
      {
        title: t('myTrainees'),
        value: data.myTraineesCount,
        desc: t('totalTraineesAcrossGroups'),
        icon: Users,
      },
      {
        title: t('todaySessions'),
        value: data.todaySessions.length,
        desc: t('scheduledForToday'),
        icon: Clock,
      },
    ];

    return (
      <div className="space-y-8 animate-fadeIn">
        <div className="p-6 rounded-2xl bg-gradient-to-r from-card/80 to-accent/20 border border-border shadow-xl flex items-center justify-between">
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Sparkles size={18} className="text-primary dark:text-primary animate-spin duration-[4000ms]" />
              <span>{t('welcome', { name: user.name })}</span>
            </h2>
            <p className="text-xs text-muted-foreground max-w-lg">{t('captainWelcomeDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={idx}
                className="relative overflow-hidden rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl transition-all duration-300 hover:scale-[1.02] hover:border-primary/50"
              >
                <div className="absolute top-0 bottom-0 start-0 w-1 bg-gradient-to-b from-primary to-accent" />
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.title}</p>
                    <h3 className="text-2xl font-extrabold text-foreground tracking-tight">{s.value}</h3>
                    <p className="text-[10px] text-muted-foreground font-medium">{s.desc}</p>
                  </div>
                  <div className="h-10 w-10 rounded-xl bg-background border border-border flex items-center justify-center text-primary dark:text-primary">
                    <Icon size={18} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Calendar className="text-primary dark:text-primary" size={16} />
                <span>{t('todaySessions')}</span>
              </h3>
              <span className="text-[10px] font-bold text-primary dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                {t('attendance')}
              </span>
            </div>

            {data.todaySessions.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{tCommon('noResults')}</p>
            ) : (
              <div className="space-y-4 flex-1">
                {data.todaySessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 rounded-xl bg-background border border-border hover:border-primary/50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 group"
                  >
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-foreground group-hover:text-primary dark:group-hover:text-primary transition-colors">
                        {session.group.name}
                      </h4>
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-medium font-mono">
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> <span dir="ltr">{session.scheduledAtLocal}</span>
                        </span>
                      </div>
                    </div>

                    <div>
                      {/* Read-only status — captains don't mark attendance. */}
                      {session.status === 'COMPLETED' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-success bg-success-soft px-3 py-1.5 rounded-xl border border-success/20">
                          <UserCheck size={14} />
                          <span>{tSchedule('completed')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-primary dark:text-primary bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20">
                          <Clock size={14} />
                          <span>{tSchedule('scheduled')}</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Activity className="text-primary dark:text-primary" size={16} />
                <span>{t('coachGuidelines')}</span>
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t('coachGuidelinesDesc')}</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2 text-foreground/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span>{t('coachGuideline1')}</span>
                </div>
                <div className="flex items-start gap-2 text-foreground/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <span>{t('coachGuideline2')}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-4 mt-6">
              <Link
                href={`/${locale}/schedule`}
                className="w-full py-2.5 rounded-xl border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200 text-xs font-bold text-center block"
              >
                {t('viewWeeklySchedule')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ─── Role Dispatch ──────────────────────────────────────────

  const renderContent = () => {
    switch (user.role) {
      case UserRole.ADMIN:
      case UserRole.MODERATOR:
        return renderAdminDashboard();
      case UserRole.CAPTAIN:
        return renderCaptainDashboard();
      default:
        return (
          <div className="text-center py-20">
            <AlertCircle size={40} className="text-danger mx-auto mb-4 animate-bounce" />
            <h3 className="text-lg font-bold text-foreground">{t('invalidRoleTitle')}</h3>
            <p className="text-xs text-muted-foreground mt-2">{t('invalidRoleContact')}</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-wide text-foreground uppercase">
            {t('title')}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {user.name} — {tUsers.has(user.role.toLowerCase()) ? tUsers(user.role.toLowerCase()) : user.role.toLowerCase()}
          </p>
        </div>
      </div>

      {renderContent()}
    </div>
  );
}
