'use client';

/**
 * Portal Subscription (FR-TP-04)
 *
 * Plan, level, sessions remaining, expiry date, freeze status.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { usePortalTrainee } from '../../portal-trainee-context';
import { SkeletonCard } from '@/components/feedback/skeleton-loader';
import { CreditCard, Snowflake, Calendar, Wallet } from 'lucide-react';

interface SubscriptionData {
  hasActiveSubscription: boolean;
  subscription: {
    planName: string;
    levelName: string;
    status: string;
    startDate: string;
    endDate: string;
    totalSessions: number;
    attendedSessions: number;
    sessionsRemaining: number;
    freezeUsed: number;
    freezeAllowed: number;
    paymentStatus: string;
    amountPaid: number | string;
    amountDue: number | string;
  } | null;
}

export default function PortalSubscriptionPage() {
  const t = useTranslations('portal');
  const tFinance = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const { selectedTraineeId } = usePortalTrainee();
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/portal/subscription${selectedTraineeId ? `?traineeId=${selectedTraineeId}` : ''}`);
      if (!res.ok) throw new Error('Failed to load subscription');
      const json = await res.json();
      setData(json.data);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, toast, tCommon, selectedTraineeId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-extrabold tracking-wide text-foreground flex items-center gap-2">
        <CreditCard size={22} className="text-primary dark:text-primary" />
        {t('subscription')}
      </h2>

      {isLoading ? (
        <SkeletonCard />
      ) : !data?.hasActiveSubscription || !data.subscription ? (
        <div className="rounded-2xl bg-card/70 border border-border p-12 backdrop-blur-xl shadow-xl text-center">
          <p className="text-sm text-muted-foreground">{t('noActiveSubscription')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-gradient-to-r from-primary/30 to-accent/20 border border-primary/30 p-6 backdrop-blur-xl shadow-xl md:col-span-2">
            <p className="text-xs text-muted-foreground">{t('planName')}</p>
            <h3 className="text-2xl font-extrabold text-foreground mt-1">
              {data.subscription.planName}
            </h3>
            <p className="text-sm text-primary dark:text-primary mt-1">{data.subscription.levelName}</p>
          </div>

          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-primary dark:text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('sessionsRemaining')}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              {data.subscription.sessionsRemaining}
              <span className="text-sm text-muted-foreground font-normal">
                {' '}
                / {data.subscription.totalSessions}
              </span>
            </p>
            <div className="h-1.5 w-full bg-background rounded-full overflow-hidden border border-border mt-3">
              <div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                style={{
                  width: `${
                    (data.subscription.attendedSessions / data.subscription.totalSessions) * 100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-warning" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('expiresOn')}
              </span>
            </div>
            <p className="text-2xl font-extrabold text-warning font-mono">
              {new Date(data.subscription.endDate).toLocaleDateString()}
            </p>
          </div>

          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Snowflake size={16} className="text-primary dark:text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('freezeStatus')}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-foreground">
              {data.subscription.freezeUsed}
              <span className="text-sm text-muted-foreground font-normal">
                {' '}
                / {data.subscription.freezeAllowed}
              </span>
            </p>
          </div>

          <div className="rounded-2xl bg-card/70 border border-border p-6 backdrop-blur-xl shadow-xl">
            <div className="flex items-center gap-2 mb-3">
              <Wallet size={16} className="text-success" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {tFinance('outstandingBalance')}
              </span>
            </div>
            <p
              className={`text-2xl font-extrabold ${
                Number(data.subscription.amountDue) > 0 ? 'text-warning' : 'text-success'
              }`}
            >
              {Number(data.subscription.amountDue).toFixed(2)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
