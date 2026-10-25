'use client';

/**
 * Trainee Detail Page
 *
 * Full trainee profile view with organized sections.
 * Edit mode toggles inline editing for each section.
 * Shows active subscription summary and quick stats.
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { RequireAccess } from '@/components/auth/require-access';
import { useAccess } from '@/lib/auth/use-access';
import { useToast } from '@/components/feedback/toast-provider';
import {
  User,
  Phone,
  Calendar,
  CreditCard,
  Activity,
  Heart,
  Edit2,
  Save,
  X,
  ArrowLeft,
  Loader2,
  PowerOff,
  Power,
  CheckCircle,
  XCircle,
  Plus,
  RefreshCw,
  Wallet,
  Users2,
  MessageSquare,
} from 'lucide-react';
import { FeedbackPanel } from '@/components/rating/feedback-panel';

// ─── Types ────────────────────────────────────────────────────

interface TraineeDetail {
  id: string;
  systemCode: string;
  dateOfBirth: string;
  whatsappNumber: string;
  parentIdCard: string;
  medicalCondition: string;
  pastExperience: string | null;
  otherAcademies: string | null;
  maritalStatus: string | null;
  fatherJob: string | null;
  fatherQualifications: string | null;
  motherJob: string | null;
  motherQualifications: string | null;
  birthOrder: number | null;
  personalityTraits: string | null;
  height: number | null;
  weight: number | null;
  armLength: number | null;
  footLength: number | null;
  chestCircumference: number | null;
  waistCircumference: number | null;
  name: string;
  /** The trainee's own status. Siblings share `user`, so its isActive is the account's. */
  isActive: boolean;
  user: {
    name: string;
    phoneNumber: string;
    isActive: boolean;
    language: string;
    lastLoginAt: string | null;
  };
  level: { id: string; name: string } | null;
  subscriptions: Array<{
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    attendedSessions: number;
    totalSessions: number;
    freezeUsed: number;
    amountPaid: number;
    amountDue: number;
    paymentStatus: string;
    plan: { id: string; name: string; freezeSessions: number };
    level: { id: string; name: string };
  }>;
  groupTrainees: Array<{ group: { id: string; name: string } }>;
}

const inputClass =
  'w-full px-3 py-2 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-all';

// Numbers that read left to right in both languages (phones, the ID card).
const LTR_FIELDS = new Set<string>(['phoneNumber', 'whatsappNumber', 'parentIdCard']);

// ─── Component ────────────────────────────────────────────────

function TraineeDetailPageContent() {
  const t = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const tFeedback = useTranslations('feedback');
  const { authFetch } = useAuth();
  const can = useAccess();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const traineeId = params.id as string;

  const [trainee, setTrainee] = useState<TraineeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<TraineeDetail & { name: string; phoneNumber: string }>>({});

  // ── Enrollment dialog state ────────────────────────────
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [enrollPlans, setEnrollPlans] = useState<Array<{ id: string; name: string; amount: string; levels: { id: string; name: string }[] }>>([]);
  const [enrollGroups, setEnrollGroups] = useState<Array<{ id: string; name: string; captain: { user: { name: string } }; availableSlots: number; isFull: boolean }>>([]);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isLoadingEnrollGroups, setIsLoadingEnrollGroups] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ planId: '', levelId: '', groupId: '', amountPaid: '0', paymentStatus: 'UNPAID' as 'PAID' | 'PARTIAL' | 'UNPAID', paymentMethod: '' as '' | 'INSTAPAY' | 'CASH' | 'EWALLET' });
  const [enrollSelectedPlan, setEnrollSelectedPlan] = useState<{ id: string; name: string; amount: string; levels: { id: string; name: string }[] } | null>(null);
  const [enrollReceipt, setEnrollReceipt] = useState<string | null>(null);

  // ── Change level/group dialog state ────────────────────
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignForm, setAssignForm] = useState({ levelId: '', groupId: '' });
  const [assignLevels, setAssignLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [assignGroups, setAssignGroups] = useState<Array<{ id: string; name: string; captain: { user: { name: string } }; availableSlots: number; isFull: boolean }>>([]);
  const [isSavingAssign, setIsSavingAssign] = useState(false);

  // ── Record payment dialog state (FR-FN-07) ─────────────
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'' | 'INSTAPAY' | 'CASH' | 'EWALLET'>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const canManage = can('manageTrainees');
  // Enrolling and renewing are their own permission ("Create subscriptions"),
  // so they show for someone who may enroll without editing the profile.
  const canEnroll = can('enroll');

  // ─── Fetch ──────────────────────────────────────────────────

  const fetchTrainee = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}`);
      if (!res.ok) throw new Error(tCommon('loadFailed'));
      const data = await res.json();
      setTrainee(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [traineeId, authFetch, toast, tCommon]);

  useEffect(() => { fetchTrainee(); }, [fetchTrainee]);

  // ─── Edit Handlers ──────────────────────────────────────────

  const startEdit = () => {
    if (!trainee) return;
    setEditForm({
      name: trainee.name,
      phoneNumber: trainee.user.phoneNumber,
      whatsappNumber: trainee.whatsappNumber,
      parentIdCard: trainee.parentIdCard,
      medicalCondition: trainee.medicalCondition,
      pastExperience: trainee.pastExperience ?? '',
      otherAcademies: trainee.otherAcademies ?? '',
      maritalStatus: trainee.maritalStatus ?? '',
      fatherJob: trainee.fatherJob ?? '',
      fatherQualifications: trainee.fatherQualifications ?? '',
      motherJob: trainee.motherJob ?? '',
      motherQualifications: trainee.motherQualifications ?? '',
      birthOrder: trainee.birthOrder ?? undefined,
      personalityTraits: trainee.personalityTraits ?? '',
      height: trainee.height ?? undefined,
      weight: trainee.weight ?? undefined,
      armLength: trainee.armLength ?? undefined,
      footLength: trainee.footLength ?? undefined,
      chestCircumference: trainee.chestCircumference ?? undefined,
      waistCircumference: trainee.waistCircumference ?? undefined,
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          dateOfBirth: trainee?.dateOfBirth,
          birthOrder: editForm.birthOrder ? Number(editForm.birthOrder) : null,
          height: editForm.height ? Number(editForm.height) : null,
          weight: editForm.weight ? Number(editForm.weight) : null,
          armLength: editForm.armLength ? Number(editForm.armLength) : null,
          footLength: editForm.footLength ? Number(editForm.footLength) : null,
          chestCircumference: editForm.chestCircumference ? Number(editForm.chestCircumference) : null,
          waistCircumference: editForm.waistCircumference ? Number(editForm.waistCircumference) : null,
        }),
      });
      if (!res.ok) throw new Error(tCommon('saveFailed'));
      toast.success(t('updated'));
      setIsEditing(false);
      fetchTrainee();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const setTraineeActive = async (action: 'activate' | 'deactivate') => {
    if (action === 'deactivate' && !confirm(t('deactivateConfirm'))) return;
    try {
      const res = await authFetch(`/api/trainees/${traineeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        // e.g. reactivation refused because the phone now signs in to someone else
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Failed to ${action}`);
      }
      toast.success(t(action === 'activate' ? 'activated' : 'deactivated'));
      fetchTrainee();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ── Record payment (FR-FN-07) ──────────────────────────

  const handleRecordPayment = async () => {
    if (!activeSubscription) return;
    setPaymentError(null);

    const amountNum = Number(paymentAmount);
    if (!amountNum || amountNum <= 0) {
      setPaymentError(t('amountPositive'));
      return;
    }
    if (!paymentMethod) {
      setPaymentError(t('selectPaymentMethod'));
      return;
    }

    setIsRecordingPayment(true);
    try {
      const res = await authFetch(`/api/subscriptions/${activeSubscription.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || t('paymentFailed'));
      }
      toast.success(tCommon('success'));
      setShowPaymentDialog(false);
      setPaymentAmount('');
      setPaymentMethod('');
      fetchTrainee();
    } catch (err: any) {
      setPaymentError(err.message);
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // ── Change level / group (within the current plan) ─────
  const openAssignDialog = async () => {
    if (!activeSubscription) return;
    const planId = activeSubscription.plan.id;
    setAssignForm({
      levelId: activeSubscription.level.id,
      groupId: trainee?.groupTrainees?.[0]?.group.id ?? '',
    });
    setAssignLevels([]);
    setAssignGroups([]);
    setShowAssignDialog(true);
    try {
      const [pRes, gRes] = await Promise.all([
        authFetch(`/api/subscriptions/plans/${planId}`),
        authFetch(`/api/groups?planId=${planId}`),
      ]);
      if (pRes.ok) { const d = await pRes.json(); setAssignLevels(d.data?.levels || []); }
      if (gRes.ok) { const d = await gRes.json(); setAssignGroups(d.data || []); }
    } catch { /* ignore */ }
  };

  const handleSaveAssignment = async () => {
    setIsSavingAssign(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}/assignment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId: assignForm.levelId, groupId: assignForm.groupId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || t('updateFailed'));
      toast.success(tCommon('success'));
      setShowAssignDialog(false);
      fetchTrainee();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingAssign(false);
    }
  };

  const ef = (key: string) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ── Enrollment helpers ─────────────────────────────────

  const openEnrollDialog = async () => {
    setEnrollForm({ planId: '', levelId: '', groupId: '', amountPaid: '0', paymentStatus: 'UNPAID', paymentMethod: '' });
    setEnrollSelectedPlan(null);
    setEnrollGroups([]);
    setEnrollReceipt(null);
    setShowEnrollDialog(true);
    try {
      const res = await authFetch('/api/subscriptions/plans?isActive=true&limit=100');
      if (res.ok) { const d = await res.json(); setEnrollPlans(d.data || []); }
    } catch { /* ignore */ }
  };

  const loadEnrollGroups = async (planId: string) => {
    setIsLoadingEnrollGroups(true);
    setEnrollGroups([]);
    try {
      const res = await authFetch(`/api/groups?planId=${planId}`);
      if (res.ok) { const d = await res.json(); setEnrollGroups(d.data || []); }
    } catch { /* ignore */ } finally {
      setIsLoadingEnrollGroups(false);
    }
  };

  const handleEnroll = async (isRenewal = false) => {
    if (!enrollForm.planId || !enrollForm.levelId || !enrollForm.groupId) {
      toast.error(t('selectPlanLevelGroup'));
      return;
    }
    if (Number(enrollForm.amountPaid) > 0 && !enrollForm.paymentMethod) {
      toast.error(t('selectPaymentMethod'));
      return;
    }
    setIsEnrolling(true);
    try {
      const endpoint = isRenewal ? '/api/subscriptions/renew' : '/api/subscriptions/enroll';
      const res = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traineeId,
          planId: enrollForm.planId,
          levelId: enrollForm.levelId,
          groupId: enrollForm.groupId,
          amountPaid: Number(enrollForm.amountPaid) || 0,
          paymentStatus: enrollForm.paymentStatus,
          ...(Number(enrollForm.amountPaid) > 0 && enrollForm.paymentMethod
            ? { paymentMethod: enrollForm.paymentMethod }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || t('enrollFailed'));
      setEnrollReceipt(data.data?.receipt?.receiptNumber ?? null);
      toast.success(isRenewal ? t('renewed') : t('enrolled'));
      fetchTrainee();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsEnrolling(false);
    }
  };

  // ─── Loading / Not found ─────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary dark:text-primary" />
      </div>
    );
  }

  if (!trainee) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <XCircle className="w-12 h-12 mx-auto mb-3 text-danger" />
        <p>{t('notFound')}</p>
      </div>
    );
  }

  const activeSubscription = trainee.subscriptions?.[0];

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/trainees`)}
            aria-label={tCommon('back')}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 rtl:-scale-x-100" aria-hidden="true" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{trainee.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                trainee.isActive
                  ? 'bg-success-soft text-success border border-success/30'
                  : 'bg-muted/70 text-muted-foreground border border-input/30'
              }`}>
                {trainee.isActive
                  ? <><CheckCircle className="w-3 h-3 inline me-1" />{tCommon('active')}</>
                  : <><XCircle className="w-3 h-3 inline me-1" />{tCommon('inactive')}</>}
              </span>
            </div>
            <p className="text-sm font-mono text-primary dark:text-primary">{trainee.systemCode}</p>
          </div>
        </div>
        {(canManage || canEnroll) && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input text-sm text-foreground/80 hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4" />{tCommon('cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {tCommon('save')}
                </button>
              </>
            ) : (
              <>
                {canManage && (
                  <button
                    onClick={startEdit}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input text-sm text-foreground/80 hover:border-primary/60 hover:text-primary dark:hover:text-primary transition-all"
                  >
                    <Edit2 className="w-4 h-4" />{tCommon('edit')}
                  </button>
                )}
                {/* Enroll button — show when no active sub */}
                {canEnroll && !activeSubscription && (
                  <button
                    onClick={openEnrollDialog}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />{t('enroll')}
                  </button>
                )}
                {/* Renew button — show when there is an expired sub */}
                {canEnroll && activeSubscription && activeSubscription.status !== 'ACTIVE' && (
                  <button
                    onClick={openEnrollDialog}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:shadow-lg hover:shadow-primary/20 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />{t('renew')}
                  </button>
                )}
                {!canManage ? null : trainee.isActive ? (
                  <button
                    onClick={() => setTraineeActive('deactivate')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger/40 text-sm text-danger hover:bg-danger-soft transition-all"
                  >
                    <PowerOff className="w-4 h-4" />{t('deactivate')}
                  </button>
                ) : (
                  <button
                    onClick={() => setTraineeActive('activate')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input text-sm text-foreground/80 hover:border-primary/60 hover:text-primary transition-all"
                  >
                    <Power className="w-4 h-4" />{t('activate')}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Active Subscription Card ─── */}
      {activeSubscription && (
        <div className="bg-gradient-to-r from-success/10 to-accent/10 border border-success/30 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-success-soft">
                <CreditCard className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{activeSubscription.plan.name}</p>
                <p className="text-sm text-success">{activeSubscription.level.name}</p>
                {trainee.groupTrainees?.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Users2 className="w-3 h-3 text-primary dark:text-primary" />
                    {trainee.groupTrainees.map((gt) => gt.group.name).join(', ')}
                  </p>
                )}
                {canManage && (
                  <button
                    onClick={openAssignDialog}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary dark:text-primary hover:text-primary dark:hover:text-primary transition-colors"
                  >
                    <Edit2 className="w-3 h-3" /> {t('editLevelGroup')}
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">{t('sessions')}</p>
                <p className="font-semibold text-foreground">
                  {activeSubscription.attendedSessions} / {activeSubscription.totalSessions}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('expires')}</p>
                <p className="font-semibold text-foreground">
                  {new Date(activeSubscription.endDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('amountDue')}</p>
                <p className={`font-semibold ${Number(activeSubscription.amountDue) > 0 ? 'text-warning' : 'text-success'}`}>
                  {Number(activeSubscription.amountDue).toFixed(2)}
                </p>
              </div>
              {can('recordPayments') && Number(activeSubscription.amountDue) > 0 && (
                <button
                  onClick={() => {
                    setPaymentAmount('');
                    setPaymentMethod('');
                    setPaymentError(null);
                    setShowPaymentDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-success-soft border border-success/30 text-success hover:bg-success/15 text-xs font-bold transition-colors self-center"
                >
                  <Wallet size={14} />
                  {t('recordPayment')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Captain Feedback (read-only) ─── */}
      <div className="bg-card/80 border border-input/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground/80 mb-4">
          <MessageSquare className="w-4 h-4 text-primary dark:text-primary" />
          {tFeedback('title')}
        </h2>
        <FeedbackPanel traineeId={trainee.id} />
      </div>

      {/* ─── Record Payment Dialog ─── */}
      {showPaymentDialog && activeSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
          <div className="w-full max-w-sm p-1 rounded-3xl bg-gradient-to-b from-success/10 via-muted/40 to-background border border-border/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-card/95 rounded-[22px] p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Wallet size={18} className="text-success" />
                  {t('recordPayment')}
                </h3>
                <button
                  onClick={() => setShowPaymentDialog(false)}
                  className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                {t('outstandingBalance')}{' '}
                <span className="text-warning font-semibold">
                  {Number(activeSubscription.amountDue).toFixed(2)}
                </span>
              </p>

              {paymentError && (
                <div className="mb-4 p-3 rounded-xl bg-danger-soft border border-danger/40 text-danger text-xs flex items-start gap-2.5">
                  <XCircle size={14} className="text-danger flex-shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-1.5 mb-5">
                <label htmlFor="dashboard-trainees-id-f1" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('amount')} <span className="text-danger">*</span>
                </label>
                <input id="dashboard-trainees-id-f1"
                  type="number"
                  step="0.01"
                  min="0"
                  max={Number(activeSubscription.amountDue)}
                  autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                />
              </div>

              <div className="space-y-1.5 mb-5">
                <label htmlFor="dashboard-trainees-id-f2" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('paymentMethod')} <span className="text-danger">*</span>
                </label>
                <select id="dashboard-trainees-id-f2"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as '' | 'INSTAPAY' | 'CASH' | 'EWALLET')}
                  className="w-full rounded-xl border border-border bg-muted/70 px-4 py-2.5 text-xs focus:border-success focus:outline-none focus:ring-4 focus:ring-success/10 text-foreground"
                >
                  <option value="">—</option>
                  <option value="INSTAPAY">{t('paymentInstapay')}</option>
                  <option value="CASH">{t('paymentCash')}</option>
                  <option value="EWALLET">{t('paymentEwallet')}</option>
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPaymentDialog(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all duration-200"
                  disabled={isRecordingPayment}
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={isRecordingPayment}
                  className="px-4 py-2 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isRecordingPayment && <Loader2 size={12} className="animate-spin" />}
                  {tCommon('submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Change Level & Group Dialog ─── */}
      {showAssignDialog && activeSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-primary/10 via-muted/40 to-background border border-border/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-card/95 rounded-[22px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">{t('editLevelGroup')}</h2>
                <button
                  onClick={() => setShowAssignDialog(false)}
                  className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                {t('withinPlan')} <span className="text-foreground/80 font-semibold">{activeSubscription.plan.name}</span>
              </p>

              <div className="space-y-1.5">
                <label htmlFor="dashboard-trainees-id-f3" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('level')}</label>
                <select id="dashboard-trainees-id-f3"
                  value={assignForm.levelId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, levelId: e.target.value }))}
                  className={inputClass}
                >
                  {assignLevels.length === 0 && (
                    <option value={assignForm.levelId}>{activeSubscription.level.name}</option>
                  )}
                  {assignLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="dashboard-trainees-id-f4" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('group')}</label>
                <select id="dashboard-trainees-id-f4"
                  value={assignForm.groupId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, groupId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">{t('selectGroup')}</option>
                  {assignGroups.length === 0 && trainee.groupTrainees?.[0] && (
                    <option value={assignForm.groupId}>{trainee.groupTrainees[0].group.name}</option>
                  )}
                  {assignGroups.map((g) => (
                    <option key={g.id} value={g.id} disabled={g.isFull && g.id !== assignForm.groupId}>
                      {g.name} · {g.captain.user.name} · {t('slotsLeft', { count: g.availableSlots })}{g.isFull ? ` ${t('full')}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAssignDialog(false)}
                  disabled={isSavingAssign}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-all"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={isSavingAssign || !assignForm.levelId || !assignForm.groupId}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingAssign && <Loader2 size={12} className="animate-spin" />}
                  {tCommon('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Info Sections ─── */}
      {/* Section helper */}
      {([
        {
          icon: User, title: t('step1Title'),
          fields: [
            { key: 'name', label: t('name'), value: trainee.name },
            { key: 'guardian', label: t('guardianAccount'), value: trainee.user.name },
            { key: 'phoneNumber', label: t('phoneNumber'), value: trainee.user.phoneNumber },
            { key: 'whatsappNumber', label: t('whatsappNumber'), value: trainee.whatsappNumber },
            { key: 'parentIdCard', label: t('parentIdCard'), value: trainee.parentIdCard },
            { key: 'medicalCondition', label: t('medicalCondition'), value: trainee.medicalCondition },
          ],
        },
        {
          icon: Heart, title: t('step3Title'),
          fields: [
            { key: 'maritalStatus', label: t('maritalStatus'), value: trainee.maritalStatus },
            { key: 'birthOrder', label: t('birthOrder'), value: trainee.birthOrder },
            { key: 'fatherJob', label: t('fatherJob'), value: trainee.fatherJob },
            { key: 'fatherQualifications', label: t('fatherQualifications'), value: trainee.fatherQualifications },
            { key: 'motherJob', label: t('motherJob'), value: trainee.motherJob },
            { key: 'motherQualifications', label: t('motherQualifications'), value: trainee.motherQualifications },
          ],
        },
        {
          icon: Activity, title: t('step4Title'),
          fields: [
            { key: 'height', label: t('height'), value: trainee.height },
            { key: 'weight', label: t('weight'), value: trainee.weight },
            { key: 'armLength', label: t('armLength'), value: trainee.armLength },
            { key: 'footLength', label: t('footLength'), value: trainee.footLength },
            { key: 'chestCircumference', label: t('chestCircumference'), value: trainee.chestCircumference },
            { key: 'waistCircumference', label: t('waistCircumference'), value: trainee.waistCircumference },
          ],
        },
      ] as const).map(({ icon: Icon, title, fields }) => (
        <div key={title} className="bg-card/80 border border-input/60 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="flex items-center gap-2 text-sm font-bold text-foreground/80 mb-4">
            <Icon className="w-4 h-4 text-primary dark:text-primary" />
            {title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(({ key, label, value }) => (
              <div key={key}>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                {isEditing ? (
                  <input
                    type="text"
                    dir={LTR_FIELDS.has(key) ? 'ltr' : undefined}
                    value={(editForm as any)[key] ?? ''}
                    onChange={ef(key)}
                    className={`${inputClass} ${LTR_FIELDS.has(key) ? 'rtl:text-right' : ''}`}
                  />
                ) : (
                  <p dir={LTR_FIELDS.has(key) ? 'ltr' : undefined} className="text-sm text-foreground rtl:text-right">
                    {value != null && value !== '' ? String(value) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ─── Enrollment Dialog ────────────────────────────── */}
      {showEnrollDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-midnight/70 backdrop-blur-sm">
          <div className="bg-card border border-primary/30 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-primary to-accent rounded-t-2xl" />
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary" />
                  {activeSubscription ? t('renewSubscription') : t('enrollTrainee')}
                </h2>
                <button onClick={() => setShowEnrollDialog(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>

              {enrollReceipt ? (
                /* Success state */
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-success-soft border border-success/40 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-success" />
                  </div>
                  <p className="font-semibold text-foreground">{t('enrollmentComplete')}</p>
                  <div className="bg-muted rounded-xl p-3">
                    <p className="text-xs text-muted-foreground mb-1">{t('receipt')}</p>
                    <p className="font-mono font-bold text-success">{enrollReceipt}</p>
                  </div>
                  <button
                    onClick={() => setShowEnrollDialog(false)}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                  >
                    {t('done')}
                  </button>
                </div>
              ) : (
                /* Form state */
                <div className="space-y-4">
                  {/* Plan */}
                  <div>
                    <label htmlFor="dashboard-trainees-id-f5" className="block text-xs font-semibold text-foreground/80 mb-1.5">{t('subscriptionPlan')} <span className="text-danger">*</span></label>
                    <select id="dashboard-trainees-id-f5"
                      className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                      value={enrollForm.planId}
                      onChange={(e) => {
                        const plan = enrollPlans.find((p) => p.id === e.target.value) || null;
                        setEnrollSelectedPlan(plan);
                        setEnrollForm((f) => ({ ...f, planId: e.target.value, levelId: '', groupId: '' }));
                        if (e.target.value) loadEnrollGroups(e.target.value);
                        else setEnrollGroups([]);
                      }}
                    >
                      <option value="">{t('selectPlan')}</option>
                      {enrollPlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {tCommon('egp', { amount: Number(p.amount).toLocaleString() })}</option>)}
                    </select>
                  </div>

                  {/* Level */}
                  {enrollSelectedPlan && (
                    <div>
                      <label htmlFor="dashboard-trainees-id-f6" className="block text-xs font-semibold text-foreground/80 mb-1.5">{t('level')} <span className="text-danger">*</span></label>
                      <select id="dashboard-trainees-id-f6"
                        className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                        value={enrollForm.levelId}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, levelId: e.target.value }))}
                      >
                        <option value="">{t('selectLevel')}</option>
                        {enrollSelectedPlan.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Group */}
                  {enrollSelectedPlan && (
                    <div>
                      <label htmlFor="dashboard-trainees-id-group" className="block text-xs font-semibold text-foreground/80 mb-1.5">{t('group')} <span className="text-danger">*</span></label>
                      {isLoadingEnrollGroups ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-1"><Loader2 className="w-4 h-4 animate-spin" />{t('loadingGroups')}</div>
                      ) : (
                        <select
                          id="dashboard-trainees-id-group"
                          className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                          value={enrollForm.groupId}
                          onChange={(e) => setEnrollForm((f) => ({ ...f, groupId: e.target.value }))}
                        >
                          <option value="">{t('selectGroup')}</option>
                          {enrollGroups.map((g) => (
                            <option key={g.id} value={g.id} disabled={g.isFull}>
                              {g.name} · {g.captain.user.name} · {t('slotsLeft', { count: g.availableSlots })}{g.isFull ? ` ${t('full')}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Payment */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="dashboard-trainees-id-f7" className="block text-xs font-semibold text-foreground/80 mb-1.5">{t('amountPaidEgp')}</label>
                      <input id="dashboard-trainees-id-f7"
                        type="number" min={0}
                        value={enrollForm.amountPaid}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, amountPaid: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                      />
                    </div>
                    <div>
                      <label htmlFor="dashboard-trainees-id-f8" className="block text-xs font-semibold text-foreground/80 mb-1.5">{t('paymentStatus')}</label>
                      <select id="dashboard-trainees-id-f8"
                        value={enrollForm.paymentStatus}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, paymentStatus: e.target.value as any }))}
                        className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                      >
                        <option value="UNPAID">{t('statusUnpaid')}</option>
                        <option value="PARTIAL">{t('statusPartial')}</option>
                        <option value="PAID">{t('statusPaid')}</option>
                      </select>
                    </div>
                  </div>

                  {Number(enrollForm.amountPaid) > 0 && (
                    <div>
                      <label htmlFor="dashboard-trainees-id-f9" className="block text-xs font-semibold text-foreground/80 mb-1.5">
                        {t('paymentMethod')} <span className="text-danger">*</span>
                      </label>
                      <select id="dashboard-trainees-id-f9"
                        value={enrollForm.paymentMethod}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, paymentMethod: e.target.value as '' | 'INSTAPAY' | 'CASH' | 'EWALLET' }))}
                        className="w-full px-3 py-2.5 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/60 transition-all"
                      >
                        <option value="">—</option>
                        <option value="INSTAPAY">{t('paymentInstapay')}</option>
                        <option value="CASH">{t('paymentCash')}</option>
                        <option value="EWALLET">{t('paymentEwallet')}</option>
                      </select>
                    </div>
                  )}

                  <button
                    onClick={() => handleEnroll(!!activeSubscription)}
                    disabled={isEnrolling || !enrollForm.planId || !enrollForm.levelId || !enrollForm.groupId}
                    className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-primary/20 transition-all"
                  >
                    {isEnrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {activeSubscription ? t('renewSubscription') : t('enrollAndReceipt')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TraineeDetailPage() {
  return (
    <RequireAccess access="viewTrainees">
      <TraineeDetailPageContent />
    </RequireAccess>
  );
}
