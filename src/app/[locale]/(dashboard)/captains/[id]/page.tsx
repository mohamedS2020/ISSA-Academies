'use client';

/**
 * Captain Detail Page
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
  'w-full px-3 py-2 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-all';

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
      <div className="text-center py-16 text-muted-foreground">
        <XCircle className="w-12 h-12 mx-auto mb-3 text-danger" />
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
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30">
            <Award className="w-6 h-6 text-primary dark:text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{captain.user.name}</h1>
              <span className="inline-flex items-center px-2 py-1 rounded-full bg-warning-soft border border-warning/20" title={t('rating')}>
                <RatingBadge average={captain.rating.average} count={captain.rating.count} size={13} />
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                captain.user.isActive
                  ? 'bg-success-soft text-success border border-success/30'
                  : 'bg-muted/70 text-muted-foreground border border-input/30'
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
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-input text-sm text-foreground/80 hover:border-primary/60 hover:text-primary dark:hover:text-primary transition-all"
                >
                  <Edit2 className="w-4 h-4" />{tCommon('edit')}
                </button>
                {captain.user.isActive && (
                  <button
                    onClick={handleDeactivate}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-danger/40 text-sm text-danger hover:bg-danger-soft transition-all"
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
      <div className="bg-card/80 border border-input/60 rounded-2xl p-6 backdrop-blur-xl space-y-5">
        <h2 className="text-sm font-bold text-foreground/80">Profile Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Name */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Full Name</p>
            {isEditing ? (
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
            ) : (
              <p className="text-sm font-semibold text-foreground">{captain.user.name}</p>
            )}
          </div>
          {/* Phone */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Phone</p>
            {isEditing ? (
              <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className={inputClass} />
            ) : (
              <p className="text-sm text-foreground">{captain.user.phoneNumber}</p>
            )}
          </div>
          {/* Specialization */}
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1">{t('specialization')}</p>
            {isEditing ? (
              <input type="text" value={editSpec} onChange={(e) => setEditSpec(e.target.value)} className={inputClass} placeholder="e.g., Freestyle, Diving..." />
            ) : (
              <p className="text-sm text-foreground">{captain.specialization ?? <span className="text-muted-foreground">—</span>}</p>
            )}
          </div>
          {/* Last Login */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Last Login</p>
            <p className="text-sm text-foreground">
              {captain.user.lastLoginAt
                ? new Date(captain.user.lastLoginAt).toLocaleString()
                : <span className="text-muted-foreground">Never</span>}
            </p>
          </div>
        </div>

        {/* Attending Days */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">{t('attendingDays')}</p>
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
                      : 'bg-muted/60 border-input/60 text-muted-foreground hover:border-primary/50'
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
      <div className="bg-card/80 border border-input/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="text-sm font-bold text-foreground/80 mb-5">{t('payrollType')}</h2>
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
                      : 'bg-muted/60 border-input/60 text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {type === 'HOURS' ? <Clock className="w-4 h-4" /> : <Percent className="w-4 h-4" />}
                  {type === 'HOURS' ? t('hours') : t('salaryPercentage')}
                </button>
              ))}
            </div>
            {editPayrollType === 'HOURS' && (
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">{t('hourlyRate')}</p>
                <input type="number" min={0} step="0.01" value={editHourlyRate} onChange={(e) => setEditHourlyRate(e.target.value)} className={inputClass} />
              </div>
            )}
            {editPayrollType === 'SALARY_PERCENTAGE' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">{t('baseSalary')}</p>
                  <input type="number" min={0} step="0.01" value={editBaseSalary} onChange={(e) => setEditBaseSalary(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">{t('percentage')}</p>
                  <input type="number" min={0} max={100} step="0.1" value={editPercentage} onChange={(e) => setEditPercentage(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-xl ${captain.payrollType === 'HOURS' ? 'bg-primary/20' : 'bg-primary/20'}`}>
                {captain.payrollType === 'HOURS'
                  ? <Clock className="w-5 h-5 text-primary dark:text-primary" />
                  : <Percent className="w-5 h-5 text-primary" />}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="text-sm font-semibold text-foreground">
                  {captain.payrollType === 'HOURS' ? t('hours') : t('salaryPercentage')}
                </p>
              </div>
            </div>
            {captain.payrollType === 'HOURS' && captain.hourlyRate != null && (
              <div>
                <p className="text-xs text-muted-foreground">{t('hourlyRate')}</p>
                <p className="text-sm font-semibold text-foreground">{Number(captain.hourlyRate).toFixed(2)}</p>
              </div>
            )}
            {captain.payrollType === 'SALARY_PERCENTAGE' && (
              <>
                {captain.baseSalary != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('baseSalary')}</p>
                    <p className="text-sm font-semibold text-foreground">{Number(captain.baseSalary).toFixed(2)}</p>
                  </div>
                )}
                {captain.percentage != null && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('percentage')}</p>
                    <p className="text-sm font-semibold text-foreground">{Number(captain.percentage).toFixed(1)}%</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ─── Assigned Groups ─── */}
      <div className="bg-card/80 border border-input/60 rounded-2xl p-6 backdrop-blur-xl">
        <h2 className="flex items-center gap-2 text-sm font-bold text-foreground/80 mb-4">
          <Users className="w-4 h-4 text-primary dark:text-primary" />
          {t('assignedGroups')}
          <span className="ms-auto text-xs font-normal text-muted-foreground">
            {captain.groups.length} {captain.groups.length === 1 ? 'group' : 'groups'}
          </span>
        </h2>
        {captain.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No groups assigned yet.</p>
        ) : (
          <div className="space-y-3">
            {captain.groups.map((group) => (
              <div
                key={group.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-muted/50 border border-input/40 hover:border-primary/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{group.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {group.scheduleDays.map((d) =>
                        DAYS_OF_WEEK.find((x) => x.key === d)?.label ?? d
                      ).join(', ')}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {group.startTime}
                    </span>
                  </div>
                </div>
                <span className="flex items-center gap-1 px-2.5 py-1 bg-muted rounded-lg text-xs font-medium text-foreground/80">
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
