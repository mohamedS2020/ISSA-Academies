'use client';

/**
 * ISSA — Captain Detail Page
 *
 * Full captain profile view with groups list.
 * Toggle inline edit mode for profile fields.
 * Payroll type can be changed with conditional rate fields.
 * Deactivate action with confirmation.
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { UserRole } from '@/types';
import {
  Award,
  ArrowLeft,
  Edit2,
  Save,
  X,
  Loader2,
  PowerOff,
  CheckCircle,
  XCircle,
  Clock,
  Percent,
  Users,
  Calendar,
} from 'lucide-react';
import { RatingBadge } from '@/components/rating/star-rating';

// ─── Types ────────────────────────────────────────────────────

interface Group {
  id: string;
  name: string;
  scheduleDays: string[];
  startTime: string;
  _count: { trainees: number };
}

interface CaptainDetail {
  id: string;
  userId: string;
  specialization: string | null;
  attendingDays: string[];
  payrollType: string;
  hourlyRate: number | null;
  baseSalary: number | null;
  percentage: number | null;
  user: {
    name: string;
    phoneNumber: string;
    isActive: boolean;
    language: string;
    lastLoginAt: string | null;
  };
  rating: { average: number | null; count: number };
  groups: Group[];
}

const DAYS_OF_WEEK = [
  { key: 'MONDAY', label: 'Mon' },
  { key: 'TUESDAY', label: 'Tue' },
  { key: 'WEDNESDAY', label: 'Wed' },
  { key: 'THURSDAY', label: 'Thu' },
  { key: 'FRIDAY', label: 'Fri' },
  { key: 'SATURDAY', label: 'Sat' },
  { key: 'SUNDAY', label: 'Sun' },
] as const;

const inputClass =
  'w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60 transition-all';

// ─── Component ────────────────────────────────────────────────

export default function CaptainDetailPage() {
  const t = useTranslations('captains');
  const tCommon = useTranslations('common');
  const { user, authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const captainId = params.id as string;

  const [captain, setCaptain] = useState<CaptainDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editDays, setEditDays] = useState<string[]>([]);
  const [editPayrollType, setEditPayrollType] = useState<'HOURS' | 'SALARY_PERCENTAGE'>('HOURS');
  const [editHourlyRate, setEditHourlyRate] = useState('');
  const [editBaseSalary, setEditBaseSalary] = useState('');
  const [editPercentage, setEditPercentage] = useState('');

  const canManage =
    user?.role === UserRole.ADMIN ||
    (user?.role === UserRole.MODERATOR &&
      (user as any).privileges?.includes('can_manage_captains'));

  // ─── Fetch ──────────────────────────────────────────────────

  const fetchCaptain = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/captains/${captainId}`);
      if (!res.ok) throw new Error('Failed to load captain');
      const data = await res.json();
      setCaptain(data.data);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [captainId, authFetch, toast]);

  useEffect(() => { fetchCaptain(); }, [fetchCaptain]);

  // ─── Edit Handlers ──────────────────────────────────────────

  const startEdit = () => {
    if (!captain) return;
    setEditName(captain.user.name);
    setEditPhone(captain.user.phoneNumber);
    setEditSpec(captain.specialization ?? '');
    setEditDays([...captain.attendingDays]);
    setEditPayrollType(captain.payrollType as 'HOURS' | 'SALARY_PERCENTAGE');
    setEditHourlyRate(captain.hourlyRate != null ? String(captain.hourlyRate) : '');
    setEditBaseSalary(captain.baseSalary != null ? String(captain.baseSalary) : '');
    setEditPercentage(captain.percentage != null ? String(captain.percentage) : '');
    setIsEditing(true);
  };

  const toggleDay = (day: string) => {
    setEditDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/captains/${captainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          phoneNumber: editPhone,
          specialization: editSpec || null,
          attendingDays: editDays,
          payrollType: editPayrollType,
          hourlyRate: editPayrollType === 'HOURS' && editHourlyRate ? Number(editHourlyRate) : null,
          baseSalary: editPayrollType === 'SALARY_PERCENTAGE' && editBaseSalary ? Number(editBaseSalary) : null,
          percentage: editPayrollType === 'SALARY_PERCENTAGE' && editPercentage ? Number(editPercentage) : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save changes');
      toast.success('Captain updated successfully');
      setIsEditing(false);
      fetchCaptain();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirm('Deactivate this captain? They will lose portal access.')) return;
    try {
      const res = await authFetch(`/api/captains/${captainId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate' }),
      });
      if (!res.ok) throw new Error('Failed to deactivate');
      toast.success('Captain deactivated');
      fetchCaptain();
    } catch (err: any) {
      toast.error(err.message);
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

  if (!captain) {
    return (
      <div className="text-center py-16 text-slate-600 dark:text-slate-400">
        <XCircle className="w-12 h-12 mx-auto mb-3 text-red-600 dark:text-red-400" />
        <p>Captain not found</p>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/${locale}/captains`)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Award className="w-6 h-6 text-primary dark:text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{captain.user.name}</h1>
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20" title={t('rating')}>
                <RatingBadge average={captain.rating.average} count={captain.rating.count} size={13} />
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                captain.user.isActive
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-200/70 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 border border-slate-300/30 dark:border-slate-600/30'
              }`}>
                {captain.user.isActive
                  ? <><CheckCircle className="w-3 h-3 inline me-1" />{tCommon('active')}</>
                  : <><XCircle className="w-3 h-3 inline me-1" />{tCommon('inactive')}</>}
              </span>
            </div>
            {captain.specialization && (
              <p className="text-sm text-primary dark:text-primary">{captain.specialization}</p>
            )}
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-sm font-semibold disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {tCommon('save')}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:border-primary/60 hover:text-primary dark:hover:text-primary transition-all"
                >
                  <Edit2 className="w-4 h-4" />{tCommon('edit')}
                </button>
                {captain.user.isActive && (
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

      {/* ─── Profile Card ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl space-y-5">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Profile Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Name */}
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Full Name</p>
            {isEditing ? (
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
            ) : (
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{captain.user.name}</p>
            )}
          </div>
          {/* Phone */}
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Phone</p>
            {isEditing ? (
              <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={inputClass} />
            ) : (
              <p className="text-sm text-slate-900 dark:text-white">{captain.user.phoneNumber}</p>
            )}
          </div>
          {/* Specialization */}
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{t('specialization')}</p>
            {isEditing ? (
              <input type="text" value={editSpec} onChange={(e) => setEditSpec(e.target.value)} className={inputClass} placeholder="e.g., Freestyle, Diving..." />
            ) : (
              <p className="text-sm text-slate-900 dark:text-white">{captain.specialization ?? <span className="text-slate-500">—</span>}</p>
            )}
          </div>
          {/* Last Login */}
          <div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Last Login</p>
            <p className="text-sm text-slate-900 dark:text-white">
              {captain.user.lastLoginAt
                ? new Date(captain.user.lastLoginAt).toLocaleString()
                : <span className="text-slate-500">Never</span>}
            </p>
          </div>
        </div>

        {/* Attending Days */}
        <div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{t('attendingDays')}</p>
          {isEditing ? (
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleDay(key)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    editDays.includes(key)
                      ? 'bg-primary/20 border-primary/60 text-primary dark:text-primary'
                      : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {captain.attendingDays.map((day) => (
                <span key={day} className="px-2.5 py-1 bg-primary/10 border border-primary/30 rounded-lg text-xs font-medium text-primary dark:text-primary">
                  {DAYS_OF_WEEK.find((d) => d.key === day)?.label ?? day}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Payroll Card ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-5">{t('payrollType')}</h2>
        {isEditing ? (
          <div className="space-y-4">
            <div className="flex gap-3">
              {(['HOURS', 'SALARY_PERCENTAGE'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEditPayrollType(type)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    editPayrollType === type
                      ? 'bg-primary/20 border-primary/60 text-primary dark:text-primary'
                      : 'bg-slate-200/60 dark:bg-slate-800/60 border-slate-300/60 dark:border-slate-600/60 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                  }`}
                >
                  {type === 'HOURS' ? <Clock className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                  {type === 'HOURS' ? t('hours') : t('salaryPercentage')}
                </button>
              ))}
            </div>
            {editPayrollType === 'HOURS' && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">{t('hourlyRate')}</p>
                <input type="number" min={0} step="0.01" value={editHourlyRate} onChange={(e) => setEditHourlyRate(e.target.value)} className={inputClass} />
              </div>
            )}
            {editPayrollType === 'SALARY_PERCENTAGE' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">{t('baseSalary')}</p>
                  <input type="number" min={0} step="0.01" value={editBaseSalary} onChange={(e) => setEditBaseSalary(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1.5">{t('percentage')}</p>
                  <input type="number" min={0} max={100} step="0.1" value={editPercentage} onChange={(e) => setEditPercentage(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${captain.payrollType === 'HOURS' ? 'bg-primary/20' : 'bg-purple-500/20'}`}>
                {captain.payrollType === 'HOURS'
                  ? <Clock className="w-5 h-5 text-primary dark:text-primary" />
                  : <Percent className="w-5 h-5 text-purple-600 dark:text-purple-400" />}
              </div>
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">Type</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {captain.payrollType === 'HOURS' ? t('hours') : t('salaryPercentage')}
                </p>
              </div>
            </div>
            {captain.payrollType === 'HOURS' && captain.hourlyRate != null && (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{t('hourlyRate')}</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{Number(captain.hourlyRate).toFixed(2)}</p>
              </div>
            )}
            {captain.payrollType === 'SALARY_PERCENTAGE' && (
              <>
                {captain.baseSalary != null && (
                  <div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{t('baseSalary')}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{Number(captain.baseSalary).toFixed(2)}</p>
                  </div>
                )}
                {captain.percentage != null && (
                  <div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{t('percentage')}</p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{Number(captain.percentage).toFixed(1)}%</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Assigned Groups ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
          <Users className="w-4 h-4 text-primary dark:text-primary" />
          {t('assignedGroups')}
          <span className="ms-auto text-xs font-normal text-slate-500">
            {captain.groups.length} {captain.groups.length === 1 ? 'group' : 'groups'}
          </span>
        </h2>
        {captain.groups.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No groups assigned yet.</p>
        ) : (
          <div className="space-y-3">
            {captain.groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-200/50 dark:bg-slate-800/40 border border-slate-300/40 dark:border-slate-700/40 hover:border-slate-300/60 dark:hover:border-slate-600/60 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{group.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <Calendar className="w-3 h-3" />
                      {group.scheduleDays.map((d) =>
                        DAYS_OF_WEEK.find((x) => x.key === d)?.label ?? d
                      ).join(', ')}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      {group.startTime}
                    </span>
                  </div>
                </div>
                <span className="flex items-center gap-1 px-2.5 py-1 bg-slate-200 dark:bg-slate-700/60 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300">
                  <Users className="w-3 h-3" />
                  {group._count.trainees}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
