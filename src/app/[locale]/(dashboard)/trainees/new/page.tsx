'use client';

/**
 * ISSA — Trainee Registration Page (4-Step Wizard)
 *
 * Step 1: Required personal info (name, DOB, phone, whatsapp, parent ID, medical)
 * Step 2: Skills & subscription level (plan/level dropdowns)
 * Step 3: Optional family info
 * Step 4: Optional physical & psychological
 *
 * On submit: displays generated system code + portal password (one-time modal).
 * Full RTL support via logical CSS properties.
 */

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import {
  User,
  Star,
  Heart,
  Activity,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  KeyRound,
  UserCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────

interface SubscriptionPlan {
  id: string;
  name: string;
  periodType: string;
  periodDays: number | null;
  amount: string;
  levels: { id: string; name: string; sortOrder: number }[];
}

interface GroupOption {
  id: string;
  name: string;
  captain: { user: { name: string } };
  _count: { trainees: number };
  maxTrainees: number;
  availableSlots: number;
  isFull: boolean;
}

interface FormData {
  // Step 1
  name: string;
  dateOfBirth: string;
  phoneNumber: string;
  whatsappNumber: string;
  parentIdCard: string;
  medicalCondition: string;
  referralType: '' | 'NEW' | 'NETWORK' | 'OLD' | 'CONTINUOUS';
  guardianName: string;
  isSelfAccount: boolean;
  // Step 2 — skills + enrollment
  pastExperience: string;
  otherAcademies: string;
  selectedPlanId: string;
  levelId: string;
  groupId: string;
  amountPaid: string;
  paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID';
  paymentMethod: '' | 'INSTAPAY' | 'CASH' | 'EWALLET';
  // Step 3
  maritalStatus: string;
  fatherJob: string;
  fatherQualifications: string;
  motherJob: string;
  motherQualifications: string;
  birthOrder: string;
  // Step 4
  personalityTraits: string;
  height: string;
  weight: string;
  armLength: string;
  footLength: string;
  chestCircumference: string;
  waistCircumference: string;
}

const INITIAL_FORM: FormData = {
  name: '', dateOfBirth: '', phoneNumber: '', whatsappNumber: '',
  parentIdCard: '', medicalCondition: '', referralType: '',
  guardianName: '', isSelfAccount: false,
  pastExperience: '', otherAcademies: '',
  selectedPlanId: '', levelId: '', groupId: '', amountPaid: '0', paymentStatus: 'UNPAID', paymentMethod: '',
  maritalStatus: '', fatherJob: '', fatherQualifications: '',
  motherJob: '', motherQualifications: '', birthOrder: '',
  personalityTraits: '', height: '', weight: '', armLength: '',
  footLength: '', chestCircumference: '', waistCircumference: '',
};

const STEPS = [
  { label: 'Personal Info', icon: User, color: 'from-cyan-500 to-blue-600' },
  { label: 'Skills & Level', icon: Star, color: 'from-purple-500 to-indigo-600' },
  { label: 'Family Info', icon: Heart, color: 'from-pink-500 to-rose-600' },
  { label: 'Physical & Psych', icon: Activity, color: 'from-emerald-500 to-teal-600' },
];

// ─── Field Component ──────────────────────────────────────────

interface FieldProps {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, required, children }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-600 dark:text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2.5 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20 transition-all';

const textareaClass = inputClass + ' resize-none h-24';

// ─── Component ────────────────────────────────────────────────

export default function NewTraineePage() {
  const t = useTranslations('trainees');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [success, setSuccess] = useState<{ systemCode: string; password: string | null; receiptNumber?: string } | null>(null);

  const set = (key: keyof FormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Load groups when a plan is selected
  const loadGroupsForPlan = async (planId: string) => {
    setIsLoadingGroups(true);
    setGroups([]);
    setForm((prev) => ({ ...prev, groupId: '' }));
    try {
      const res = await authFetch(`/api/groups?planId=${planId}`);
      if (res.ok) {
        const data = await res.json();
        setGroups(data.data || []);
      }
    } catch { /* ignore */ } finally {
      setIsLoadingGroups(false);
    }
  };

  // Prefill plan + group when arriving from a group's "Add Trainee" button
  // (/trainees/new?planId=..&groupId=..). Reads window.location to avoid the
  // useSearchParams Suspense constraint; runs once on mount. Personal info
  // (step 0) is still filled normally — the enrollment step just arrives
  // pre-selected.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const planId = sp.get('planId');
    const groupId = sp.get('groupId');
    if (!planId) return;
    (async () => {
      try {
        const pRes = await authFetch('/api/subscriptions/plans?isActive=true&limit=100');
        if (!pRes.ok) return;
        const pData = await pRes.json();
        const loadedPlans: SubscriptionPlan[] = pData.data || [];
        setPlans(loadedPlans);
        const plan = loadedPlans.find((p) => p.id === planId);
        if (!plan) return;
        setSelectedPlan(plan);
        setForm((prev) => ({ ...prev, selectedPlanId: planId }));
        const gRes = await authFetch(`/api/groups?planId=${planId}`);
        if (gRes.ok) {
          const gData = await gRes.json();
          setGroups(gData.data || []);
        }
        if (groupId) setForm((prev) => ({ ...prev, groupId }));
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load plans when entering step 2
  const handleNext = async () => {
    if (!validateStep()) return;
    if (step === 0) {
      try {
        const res = await authFetch('/api/subscriptions/plans?isActive=true&limit=100');
        if (res.ok) {
          const data = await res.json();
          setPlans(data.data || []);
        }
      } catch { /* ignore */ }
    }
    setStep((s) => s + 1);
  };

  // ─── Validation ─────────────────────────────────────────────

  const validateStep = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (step === 0) {
      if (!form.name.trim()) newErrors.name = 'Full name is required';
      if (!form.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
      if (!form.phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';
      if (!form.whatsappNumber.trim()) newErrors.whatsappNumber = 'WhatsApp number is required';
      if (!form.parentIdCard.trim()) newErrors.parentIdCard = 'Parent ID card is required';
      if (!form.medicalCondition.trim()) newErrors.medicalCondition = 'Medical condition is required';
      if (!form.referralType) newErrors.referralType = 'Referral type is required';
      if (!form.isSelfAccount && !form.guardianName.trim()) {
        newErrors.guardianName = t('guardianNameRequired');
      }
    }
    if (step === 1) {
      if (form.groupId && Number(form.amountPaid) > 0 && !form.paymentMethod) {
        newErrors.paymentMethod = 'Payment method is required when an amount is paid';
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Enrolling with a payment requires a method (server enforces this too).
    // Guard here so we don't create the trainee and then fail the enroll.
    if (form.groupId && Number(form.amountPaid) > 0 && !form.paymentMethod) {
      toast.error('Please select a payment method');
      setStep(1);
      return;
    }
    setIsSubmitting(true);
    try {
      // Step 1: Register trainee
      const payload: Record<string, unknown> = {
        name: form.name,
        dateOfBirth: form.dateOfBirth,
        phoneNumber: form.phoneNumber,
        whatsappNumber: form.whatsappNumber,
        parentIdCard: form.parentIdCard,
        medicalCondition: form.medicalCondition,
        referralType: form.referralType,
        guardianName: form.isSelfAccount ? null : (form.guardianName || null),
        isSelfAccount: form.isSelfAccount,
        pastExperience: form.pastExperience || null,
        otherAcademies: form.otherAcademies || null,
        levelId: form.levelId || null,
        maritalStatus: form.maritalStatus || null,
        fatherJob: form.fatherJob || null,
        fatherQualifications: form.fatherQualifications || null,
        motherJob: form.motherJob || null,
        motherQualifications: form.motherQualifications || null,
        birthOrder: form.birthOrder ? Number(form.birthOrder) : null,
        personalityTraits: form.personalityTraits || null,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        armLength: form.armLength ? Number(form.armLength) : null,
        footLength: form.footLength ? Number(form.footLength) : null,
        chestCircumference: form.chestCircumference ? Number(form.chestCircumference) : null,
        waistCircumference: form.waistCircumference ? Number(form.waistCircumference) : null,
      };

      const res = await authFetch('/api/trainees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Registration failed');

      const traineeId = data.data.trainee.id;
      let receiptNumber: string | undefined;

      // Step 2: Enroll (if plan + level + group selected)
      if (form.selectedPlanId && form.levelId && form.groupId) {
        const enrollRes = await authFetch('/api/subscriptions/enroll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            traineeId,
            planId: form.selectedPlanId,
            levelId: form.levelId,
            groupId: form.groupId,
            amountPaid: Number(form.amountPaid) || 0,
            paymentStatus: form.paymentStatus,
            ...(Number(form.amountPaid) > 0 && form.paymentMethod
              ? { paymentMethod: form.paymentMethod }
              : {}),
          }),
        });
        const enrollData = await enrollRes.json();
        if (!enrollRes.ok) {
          toast.error(`Trainee registered but enrollment failed: ${enrollData.error?.message}`);
        } else {
          receiptNumber = enrollData.data?.receipt?.receiptNumber;
        }
      }

      setSuccess({
        systemCode: data.data.trainee.systemCode,
        password: data.data.portalPassword,
        receiptNumber,
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Step Renderers ──────────────────────────────────────────

  const renderStep0 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label={t('name')} required>
        <input type="text" value={form.name} onChange={set('name')} className={inputClass} placeholder={t('traineeNamePlaceholder')} />
        {errors.name && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name}</p>}
      </Field>
      <div className="md:col-span-2 flex items-center gap-2">
        <input
          id="selfAccount"
          type="checkbox"
          checked={form.isSelfAccount}
          onChange={(e) => setForm((p) => ({ ...p, isSelfAccount: e.target.checked, guardianName: e.target.checked ? '' : p.guardianName }))}
          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 accent-cyan-500"
        />
        <label htmlFor="selfAccount" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          {t('selfAccount')}
        </label>
      </div>
      {!form.isSelfAccount && (
        <Field label={t('guardianName')} required>
          <input type="text" value={form.guardianName} onChange={set('guardianName')} className={inputClass} placeholder={t('guardianNamePlaceholder')} />
          {errors.guardianName && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.guardianName}</p>}
        </Field>
      )}
      <Field label={t('dateOfBirth')} required>
        <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} className={inputClass} />
        {errors.dateOfBirth && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.dateOfBirth}</p>}
      </Field>
      <Field label={t('phoneNumber')} required>
        <input type="tel" value={form.phoneNumber} onChange={set('phoneNumber')} className={inputClass} placeholder="+201234567890" />
        {errors.phoneNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.phoneNumber}</p>}
      </Field>
      <Field label={t('whatsappNumber')} required>
        <input type="tel" value={form.whatsappNumber} onChange={set('whatsappNumber')} className={inputClass} placeholder="+201234567890" />
        {errors.whatsappNumber && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.whatsappNumber}</p>}
      </Field>
      <Field label={t('parentIdCard')} required>
        <input type="text" value={form.parentIdCard} onChange={set('parentIdCard')} className={inputClass} placeholder="National ID number" />
        {errors.parentIdCard && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.parentIdCard}</p>}
      </Field>
      <Field label={t('medicalCondition')} required>
        <input type="text" value={form.medicalCondition} onChange={set('medicalCondition')} className={inputClass} placeholder='e.g., "None" or describe condition' />
        {errors.medicalCondition && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.medicalCondition}</p>}
      </Field>
      <Field label={t('referralType')} required>
        <select
          value={form.referralType}
          onChange={(e) => {
            setForm((p) => ({ ...p, referralType: e.target.value as FormData['referralType'] }));
            if (errors.referralType) setErrors((prev) => ({ ...prev, referralType: undefined }));
          }}
          className={inputClass}
        >
          <option value="">—</option>
          <option value="NEW">{t('referralNew')}</option>
          <option value="NETWORK">{t('referralNetwork')}</option>
          <option value="OLD">{t('referralOld')}</option>
          <option value="CONTINUOUS">{t('referralContinuous')}</option>
        </select>
        {errors.referralType && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.referralType}</p>}
      </Field>
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <Field label={t('pastExperience')}>
        <textarea value={form.pastExperience} onChange={set('pastExperience')} className={textareaClass} placeholder="Describe any prior swimming experience..." />
      </Field>
      <Field label={t('otherAcademies')}>
        <textarea value={form.otherAcademies} onChange={set('otherAcademies')} className={textareaClass} placeholder="Is the trainee enrolled in other academies?" />
      </Field>

      {/* ── Enrollment section ─────────────────────── */}
      <div className="pt-2 border-t border-slate-300/60 dark:border-slate-700/60">
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3">Enrollment (optional)</p>
        {plans.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400 py-2">No active subscription plans. You can enroll the trainee later from their profile.</p>
        ) : (
          <div className="space-y-3">
            {/* Plan selector */}
            <Field label={t('startingLevel')}>
              <select
                value={form.selectedPlanId}
                className={inputClass}
                onChange={(e) => {
                  const plan = plans.find((p) => p.id === e.target.value) || null;
                  setSelectedPlan(plan);
                  setForm((prev) => ({ ...prev, selectedPlanId: e.target.value, levelId: '', groupId: '' }));
                  if (e.target.value) loadGroupsForPlan(e.target.value);
                  else setGroups([]);
                }}
              >
                <option value="">Select a subscription plan</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — {Number(p.amount).toLocaleString()} EGP</option>
                ))}
              </select>
            </Field>

            {/* Level selector */}
            {selectedPlan && (
              <Field label="Starting Level">
                <select value={form.levelId} onChange={set('levelId')} className={inputClass}>
                  <option value="">Select a level</option>
                  {selectedPlan.levels.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </Field>
            )}

            {/* Group selector */}
            {selectedPlan && (
              <Field label="Assign to Group">
                {isLoadingGroups ? (
                  <div className="flex items-center gap-2 py-2 text-slate-600 dark:text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading groups...
                  </div>
                ) : groups.length === 0 ? (
                  <p className="text-sm text-slate-600 dark:text-slate-400 py-1">No available groups for this plan.</p>
                ) : (
                  <select value={form.groupId} onChange={set('groupId')} className={inputClass}>
                    <option value="">Select a group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id} disabled={g.isFull}>
                        {g.name} · {g.captain.user.name} · {g.availableSlots} slots left{g.isFull ? ' (full)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}

            {/* Payment */}
            {form.groupId && (
              <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Amount Paid (EGP)">
                  <input type="number" min={0} value={form.amountPaid} onChange={set('amountPaid')} className={inputClass} placeholder="0" />
                </Field>
                <Field label="Payment Status">
                  <select
                    value={form.paymentStatus}
                    onChange={(e) => setForm((p) => ({ ...p, paymentStatus: e.target.value as any }))}
                    className={inputClass}
                  >
                    <option value="UNPAID">Unpaid</option>
                    <option value="PARTIAL">Partial</option>
                    <option value="PAID">Paid</option>
                  </select>
                </Field>
              </div>
              {Number(form.amountPaid) > 0 && (
                <Field label={t('paymentMethod')} required>
                  <select
                    value={form.paymentMethod}
                    onChange={(e) => {
                      setForm((p) => ({ ...p, paymentMethod: e.target.value as FormData['paymentMethod'] }));
                      if (errors.paymentMethod) setErrors((prev) => ({ ...prev, paymentMethod: undefined }));
                    }}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    <option value="INSTAPAY">{t('paymentInstapay')}</option>
                    <option value="CASH">{t('paymentCash')}</option>
                    <option value="EWALLET">{t('paymentEwallet')}</option>
                  </select>
                  {errors.paymentMethod && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMethod}</p>}
                </Field>
              )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label={t('maritalStatus')}>
        <input type="text" value={form.maritalStatus} onChange={set('maritalStatus')} className={inputClass} placeholder="e.g., Single, Married" />
      </Field>
      <Field label={t('birthOrder')}>
        <input type="number" min={1} max={20} value={form.birthOrder} onChange={set('birthOrder')} className={inputClass} placeholder="e.g., 1, 2, 3..." />
      </Field>
      <Field label={t('fatherJob')}>
        <input type="text" value={form.fatherJob} onChange={set('fatherJob')} className={inputClass} />
      </Field>
      <Field label={t('fatherQualifications')}>
        <input type="text" value={form.fatherQualifications} onChange={set('fatherQualifications')} className={inputClass} />
      </Field>
      <Field label={t('motherJob')}>
        <input type="text" value={form.motherJob} onChange={set('motherJob')} className={inputClass} />
      </Field>
      <Field label={t('motherQualifications')}>
        <input type="text" value={form.motherQualifications} onChange={set('motherQualifications')} className={inputClass} />
      </Field>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <Field label={t('personalityTraits')}>
        <textarea value={form.personalityTraits} onChange={set('personalityTraits')} className={textareaClass} placeholder="Describe personality traits..." />
      </Field>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {(['height','weight','armLength','footLength','chestCircumference','waistCircumference'] as const).map((field) => (
          <Field key={field} label={t(field)}>
            <input
              type="number"
              min={0}
              step="0.1"
              value={form[field]}
              onChange={set(field)}
              className={inputClass}
              placeholder="0.0"
            />
          </Field>
        ))}
      </div>
    </div>
  );

  const stepContent = [renderStep0, renderStep1, renderStep2, renderStep3];

  // ─── Success Modal ────────────────────────────────────────────

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <div className="bg-white dark:bg-slate-900 border border-emerald-500/40 rounded-2xl w-full max-w-md p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
            <UserCheck className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Trainee Registered!</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">Registration complete. Save the details below.</p>
          </div>
          <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl p-4 text-start space-y-3">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{t('systemCode')}</p>
              <p className="font-mono text-lg font-bold text-cyan-600 dark:text-cyan-400">{success.systemCode}</p>
            </div>
            <hr className="border-slate-300 dark:border-slate-700" />
            {success.password ? (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{t('portalPassword')}</p>
                <p className="font-mono text-lg font-bold text-amber-600 dark:text-amber-400">{success.password}</p>
                <p className="text-xs text-slate-500 mt-1">{t('portalPasswordNote')}</p>
              </div>
            ) : (
              <div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{t('portalPassword')}</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{t('linkedToAccount')}</p>
              </div>
            )}
            {success.receiptNumber && (
              <>
                <hr className="border-slate-300 dark:border-slate-700" />
                <div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">Receipt Number</p>
                  <p className="font-mono text-base font-bold text-emerald-600 dark:text-emerald-400">{success.receiptNumber}</p>
                </div>
              </>
            )}
          </div>
          {success.password && (
            <button
              onClick={() => { navigator.clipboard.writeText(success.password!); toast.success('Copied!'); }}
              className="w-full py-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Copy Password
            </button>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => { setSuccess(null); setForm(INITIAL_FORM); setStep(0); setSelectedPlan(null); setGroups([]); }}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Register Another
            </button>
            <button
              onClick={() => router.push(`/${locale}/trainees`)}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold"
            >
              Go to Trainees
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* ─── Page Title ─── */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30">
          <UserCheck className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('register')}</h1>
      </div>

      {/* ─── Step Progress ─── */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
                isActive
                  ? `bg-gradient-to-r ${s.color} text-white shadow-lg`
                  : isDone
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500'
              }`}>
                {isDone ? (
                  <Check className="w-4 h-4 shrink-0" />
                ) : (
                  <Icon className="w-4 h-4 shrink-0" />
                )}
                <span className="text-xs font-semibold hidden sm:block">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${isDone ? 'bg-emerald-500/50' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Step Card ─── */}
      <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-300/60 dark:border-slate-700/60 rounded-2xl backdrop-blur-xl overflow-hidden">
        <div className={`h-1 bg-gradient-to-r ${STEPS[step].color}`} />
        <div className="p-6 md:p-8">
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2">
            {(() => { const Icon = STEPS[step].icon; return <Icon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />; })()}
            {t(`step${step + 1}Title` as any)}
          </h2>
          {stepContent[step]()}
        </div>
      </div>

      {/* ─── Navigation Buttons ─── */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
          {tCommon('previous')}
        </button>
        {step < STEPS.length - 1 ? (
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-cyan-500/25 transition-all hover:-translate-y-0.5"
          >
            {tCommon('next')}
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg hover:shadow-emerald-500/25 transition-all hover:-translate-y-0.5"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {tCommon('submit')}
          </button>
        )}
      </div>
    </div>
  );
}
