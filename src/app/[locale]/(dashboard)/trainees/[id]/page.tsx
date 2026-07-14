'use client';

/**
 * ISSA — Trainee Detail Page
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
import { useToast } from '@/components/feedback/toast-provider';
import { UserRole } from '@/types';
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
  'w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 transition-all';

// ─── Component ────────────────────────────────────────────────

export default function TraineeDetailPage() {
  const t = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const tFeedback = useTranslations('feedback');
  const { user, authFetch } = useAuth();
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

  const canManage =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_manage_trainees'));

  // ─── Fetch ──────────────────────────────────────────────────

  const fetchTrainee = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}`);
      if (!res.ok) throw new Error('Failed to load trainee');
      const data = await res.json();
      setTrainee(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [traineeId, authFetch, toast]);

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
      if (!res.ok) throw new Error('Failed to save changes');
      toast.success('Trainee updated successfully');
      setIsEditing(false);
      fetchTrainee();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this trainee? They will lose portal access.')) return;
    try {
      const res = await authFetch(`/api/trainees/${traineeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (!res.ok) throw new Error('Failed to deactivate');
      toast.success('Trainee deactivated');
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
      setPaymentError('Amount must be a positive number');
      return;
    }
    if (!paymentMethod) {
      setPaymentError('Please select a payment method');
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
        throw new Error(data.error?.message || 'Failed to record payment');
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
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update');
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
      toast.error('Please select a plan, level, and group');
      return;
    }
    if (Number(enrollForm.amountPaid) > 0 && !enrollForm.paymentMethod) {
      toast.error('Please select a payment method');
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
      if (!res.ok) throw new Error(data.error?.message || 'Enrollment failed');
      setEnrollReceipt(data.data?.receipt?.receiptNumber ?? null);
      toast.success(isRenewal ? 'Subscription renewed!' : 'Trainee enrolled!');
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
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600 dark:text-cyan-400" />
      </div>
    );
  }

  if (!trainee) {
    return (
      <div className="text-center py-16 text-slate-600 dark:text-slate-400">
        <XCircle className="w-12 h-12 mx-auto mb-3 text-red-600 dark:text-red-400" />
        <p>Trainee not found</p>
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
            className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{trainee.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                trainee.user.isActive
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
              }`}>
                {trainee.user.isActive
                  ? <><CheckCircle className="w-3 h-3 inline me-1" />{tCommon('active')}</>
                  : <><XCircle className="w-3 h-3 inline me-1" />{tCommon('inactive')}</>}
              </span>
            </div>
            <p className="text-sm font-mono text-cyan-600 dark:text-cyan-400">{trainee.systemCode}</p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />{tCommon('cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {tCommon('save')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:border-cyan-500/60 hover:text-cyan-700 dark:hover:text-cyan-300 transition-all"
                >
                  <Edit2 className="w-4 h-4" />{tCommon('edit')}
                </button>
                {/* Enroll button — show when no active sub */}
                {!activeSubscription && (
                  <button
                    onClick={openEnrollDialog}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                  >
                    <Plus className="w-4 h-4" />Enroll
                  </button>
                )}
                {/* Renew button — show when there is an expired sub */}
                {activeSubscription && activeSubscription.status !== 'ACTIVE' && (
                  <button
                    onClick={openEnrollDialog}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-amber-500/20 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />Renew
                  </button>
                )}
                {trainee.user.isActive && (
                  <button
                    onClick={handleDeactivate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/40 text-sm text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <PowerOff className="w-4 h-4" />Deactivate
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Active Subscription Card ─── */}
      {activeSubscription && (
        <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20">
                <CreditCard className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">{activeSubscription.plan.name}</p>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">{activeSubscription.level.name}</p>
                {trainee.groupTrainees?.length > 0 && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1">
                    <Users2 className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                    {trainee.groupTrainees.map((gt) => gt.group.name).join(', ')}
                  </p>
                )}
                {canManage && (
                  <button
                    onClick={openAssignDialog}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
                  >
                    <Edit2 className="w-3 h-3" /> Edit Level &amp; Group
                  </button>
                )}
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Sessions</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {activeSubscription.attendedSessions} / {activeSubscription.totalSessions}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Expires</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {new Date(activeSubscription.endDate).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Amount Due</p>
                <p className={`font-semibold ${Number(activeSubscription.amountDue) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {Number(activeSubscription.amountDue).toFixed(2)}
                </p>
              </div>
              {canManage && Number(activeSubscription.amountDue) > 0 && (
                <button
                  onClick={() => {
                    setPaymentAmount('');
                    setPaymentMethod('');
                    setPaymentError(null);
                    setShowPaymentDialog(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition-colors self-center"
                >
                  <Wallet size={14} />
                  Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Captain Feedback (read-only) ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          <MessageSquare className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          {tFeedback('title')}
        </h2>
        <FeedbackPanel traineeId={trainee.id} />
      </div>

      {/* ─── Record Payment Dialog ─── */}
      {showPaymentDialog && activeSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md px-4">
          <div className="w-full max-w-sm p-1 rounded-3xl bg-gradient-to-b from-emerald-500/10 via-slate-100/40 dark:via-slate-900/5 to-slate-50 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-white/95 dark:bg-slate-950/95 rounded-[22px] p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Wallet size={18} className="text-emerald-600 dark:text-emerald-400" />
                  Record Payment
                </h3>
                <button
                  onClick={() => setShowPaymentDialog(false)}
                  className="h-7 w-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                Outstanding balance:{' '}
                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                  {Number(activeSubscription.amountDue).toFixed(2)}
                </span>
              </p>

              {paymentError && (
                <div className="mb-4 p-3 rounded-xl bg-red-950/30 border border-red-800/40 text-red-200 text-xs flex items-start gap-2.5">
                  <XCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{paymentError}</span>
                </div>
              )}

              <div className="space-y-1.5 mb-5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={Number(activeSubscription.amountDue)}
                  autoFocus
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5 mb-5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {t('paymentMethod')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as '' | 'INSTAPAY' | 'CASH' | 'EWALLET')}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/50 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 text-slate-900 dark:text-slate-100"
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200"
                  disabled={isRecordingPayment}
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={isRecordingPayment}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all duration-300 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isRecordingPayment && <Loader2 size={12} className="animate-spin" />}
                  Submit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Change Level & Group Dialog ─── */}
      {showAssignDialog && activeSubscription && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md px-4">
          <div className="w-full max-w-md p-1 rounded-3xl bg-gradient-to-b from-cyan-500/10 via-slate-100/40 dark:via-slate-900/5 to-slate-50 dark:to-slate-950 border border-slate-200/80 dark:border-slate-800/80 shadow-2xl backdrop-blur-xl">
            <div className="bg-white/95 dark:bg-slate-950/95 rounded-[22px] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Edit Level &amp; Group</h2>
                <button
                  onClick={() => setShowAssignDialog(false)}
                  className="h-7 w-7 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                  &times;
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Within plan <span className="text-slate-700 dark:text-slate-300 font-semibold">{activeSubscription.plan.name}</span>
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Level</label>
                <select
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Group</label>
                <select
                  value={assignForm.groupId}
                  onChange={(e) => setAssignForm((f) => ({ ...f, groupId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select a group</option>
                  {assignGroups.length === 0 && trainee.groupTrainees?.[0] && (
                    <option value={assignForm.groupId}>{trainee.groupTrainees[0].group.name}</option>
                  )}
                  {assignGroups.map((g) => (
                    <option key={g.id} value={g.id} disabled={g.isFull && g.id !== assignForm.groupId}>
                      {g.name} · {g.captain.user.name} · {g.availableSlots} slots left{g.isFull ? ' (full)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowAssignDialog(false)}
                  disabled={isSavingAssign}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleSaveAssignment}
                  disabled={isSavingAssign || !assignForm.levelId || !assignForm.groupId}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
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
        <div key={title} className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
            <Icon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            {title}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {fields.map(({ key, label, value }) => (
              <div key={key}>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{label}</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={(editForm as any)[key] ?? ''}
                    onChange={ef(key)}
                    className={inputClass}
                  />
                ) : (
                  <p className="text-sm text-slate-900 dark:text-white">
                    {value != null && value !== '' ? String(value) : (
                      <span className="text-slate-500">—</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 border border-purple-500/30 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="h-1 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-t-2xl" />
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  {activeSubscription ? 'Renew Subscription' : 'Enroll Trainee'}
                </h2>
                <button onClick={() => setShowEnrollDialog(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {enrollReceipt ? (
                /* Success state */
                <div className="text-center py-4 space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <CheckCircle className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">Enrollment complete!</p>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-3">
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Receipt</p>
                    <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{enrollReceipt}</p>
                  </div>
                  <button
                    onClick={() => setShowEnrollDialog(false)}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Form state */
                <div className="space-y-4">
                  {/* Plan */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Subscription Plan <span className="text-red-600 dark:text-red-400">*</span></label>
                    <select
                      className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
                      value={enrollForm.planId}
                      onChange={(e) => {
                        const plan = enrollPlans.find((p) => p.id === e.target.value) || null;
                        setEnrollSelectedPlan(plan);
                        setEnrollForm((f) => ({ ...f, planId: e.target.value, levelId: '', groupId: '' }));
                        if (e.target.value) loadEnrollGroups(e.target.value);
                        else setEnrollGroups([]);
                      }}
                    >
                      <option value="">Select a plan</option>
                      {enrollPlans.map((p) => <option key={p.id} value={p.id}>{p.name} — {Number(p.amount).toLocaleString()} EGP</option>)}
                    </select>
                  </div>

                  {/* Level */}
                  {enrollSelectedPlan && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Level <span className="text-red-600 dark:text-red-400">*</span></label>
                      <select
                        className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
                        value={enrollForm.levelId}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, levelId: e.target.value }))}
                      >
                        <option value="">Select a level</option>
                        {enrollSelectedPlan.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Group */}
                  {enrollSelectedPlan && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Group <span className="text-red-600 dark:text-red-400">*</span></label>
                      {isLoadingEnrollGroups ? (
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm py-1"><Loader2 className="w-4 h-4 animate-spin" />Loading groups...</div>
                      ) : (
                        <select
                          className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
                          value={enrollForm.groupId}
                          onChange={(e) => setEnrollForm((f) => ({ ...f, groupId: e.target.value }))}
                        >
                          <option value="">Select a group</option>
                          {enrollGroups.map((g) => (
                            <option key={g.id} value={g.id} disabled={g.isFull}>
                              {g.name} · {g.captain.user.name} · {g.availableSlots} slots left{g.isFull ? ' (full)' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Payment */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Amount Paid (EGP)</label>
                      <input
                        type="number" min={0}
                        value={enrollForm.amountPaid}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, amountPaid: e.target.value }))}
                        className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Payment Status</label>
                      <select
                        value={enrollForm.paymentStatus}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, paymentStatus: e.target.value as any }))}
                        className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
                      >
                        <option value="UNPAID">Unpaid</option>
                        <option value="PARTIAL">Partial</option>
                        <option value="PAID">Paid</option>
                      </select>
                    </div>
                  </div>

                  {Number(enrollForm.amountPaid) > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        {t('paymentMethod')} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={enrollForm.paymentMethod}
                        onChange={(e) => setEnrollForm((f) => ({ ...f, paymentMethod: e.target.value as '' | 'INSTAPAY' | 'CASH' | 'EWALLET' }))}
                        className="w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-500/60 transition-all"
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
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                  >
                    {isEnrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {activeSubscription ? 'Renew Subscription' : 'Enroll & Generate Receipt'}
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
