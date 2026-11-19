'use client';

/**
 * Academy data import, on the super admin's academy page: download the
 * template, then import a filled one into an empty branch.
 *
 *   branch (only when the academy has several) → file → check → import → logins
 *
 * The check saves nothing. With problems, it lists them and offers the
 * academy's own file with each problem marked, to send back. Importing sends
 * the same file again; the server re-checks it before writing anything. The
 * logins file is offered once, right after the import.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Download, FileSpreadsheet, Loader2, Upload, CheckCircle2, AlertTriangle, KeyRound, X } from 'lucide-react';
import { useToast } from '@/components/feedback/toast-provider';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/i18n/format';
import { issueText, type ImportIssue } from '@/lib/import/messages';
import { SHEETS } from '@/lib/import/template';
import { DEFAULT_CURRENCY } from '@/lib/format/currency';
import type { ImportSummary } from '@/lib/import/validate';

interface Branch {
  id: string;
  name: string;
  code: string;
  isEmpty: boolean;
}

interface HistoryEntry {
  id: string;
  at: string;
  branchId: string;
  fileName: string | null;
  summary: ImportSummary | null;
}

interface CheckData {
  ok: boolean;
  summary: ImportSummary;
  issues: ImportIssue[];
  markedFile: string | null;
}

interface DoneData {
  summary: ImportSummary;
  credentials: string;
  sessionWarnings: string[];
}

type Step = 'branch' | 'file' | 'checking' | 'checked' | 'importing' | 'done';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function downloadBase64(base64: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const BUTTON = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:min-h-10';
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`;
const SECONDARY = `${BUTTON} border border-input text-foreground/80 hover:bg-muted`;

export function AcademyImport({ tenantId, academyName }: { tenantId: string; academyName: string }) {
  const t = useTranslations('superAdmin.import');
  const locale = useLocale();
  const { toast } = useToast();
  const titleId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const base = `/api/superadmin/tenants/${tenantId}/import`;
  const context = useQuery({
    queryKey: ['superadmin', 'import', tenantId],
    queryFn: async (): Promise<{ branches: Branch[]; history: HistoryEntry[]; currency: string }> => {
      const res = await fetch(base);
      if (!res.ok) throw new Error(t('failed'));
      return (await res.json()).data;
    },
  });
  const branches = context.data?.branches ?? null;
  const history = context.data?.history ?? [];
  // Amounts in the academy's own currency (the super admin has none).
  const money = (n: number) => formatMoney(n, context.data?.currency ?? DEFAULT_CURRENCY, locale);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('file');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<CheckData | null>(null);
  const [done, setDone] = useState<DoneData | null>(null);

  const emptyBranches = (branches ?? []).filter((b) => b.isEmpty);
  const branchName = (id: string) => branches?.find((b) => b.id === id)?.name ?? '';

  const start = () => {
    setFile(null);
    setChecked(null);
    setDone(null);
    // One empty branch, or only one branch: no need to ask.
    if ((branches?.length ?? 0) > 1) {
      setBranchId(emptyBranches.length === 1 ? emptyBranches[0].id : null);
      setStep('branch');
    } else {
      setBranchId(emptyBranches[0]?.id ?? null);
      setStep('file');
    }
    setOpen(true);
  };

  const close = () => {
    if (step === 'checking' || step === 'importing') return;
    setOpen(false);
    if (done) void context.refetch();
  };

  // Escape closes, as in the app's other dialogs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const upload = async (url: string) => {
    const body = new FormData();
    body.append('file', file!);
    body.append('branchId', branchId!);
    const res = await fetch(url, { method: 'POST', body });
    const json = await res.json().catch(() => null);
    return { res, json };
  };

  const runCheck = async () => {
    if (!file || !branchId) return;
    setStep('checking');
    try {
      const { res, json } = await upload(`${base}/check`);
      if (!res.ok) throw new Error(json?.error?.message);
      setChecked(json.data);
      setStep('checked');
    } catch (err) {
      toast.error((err as Error).message || t('failed'));
      setStep('file');
    }
  };

  const runImport = async () => {
    if (!file || !branchId) return;
    setStep('importing');
    try {
      const { res, json } = await upload(base);
      if (res.status === 422 && json?.data) {
        // Something changed since the check (e.g. a phone was taken): show why.
        setChecked(json.data);
        setStep('checked');
        return;
      }
      if (!res.ok) throw new Error(json?.error?.message);
      setDone(json.data);
      setStep('done');
      downloadBase64(json.data.credentials, t('credentialsFileName', { branch: branchName(branchId) }));
    } catch (err) {
      toast.error((err as Error).message || t('failed'));
      setStep('checked');
    }
  };

  const where = (i: ImportIssue) => {
    const sheet = SHEETS.find((s) => s.key === i.sheet);
    const column = sheet?.columns.find((c) => c.key === i.column);
    const lang = locale === 'ar' ? 'ar' : 'en';
    return [sheet?.[lang], i.row ? t('row', { row: i.row }) : null, column?.[lang]].filter(Boolean).join(' · ');
  };

  const summaryLines = (s: ImportSummary) => [
    [t('sumPlans'), t('sumPlansValue', { plans: s.plans, levels: s.levels })],
    [t('sumCaptains'), formatNumber(s.captains, locale)],
    [t('sumGroups'), formatNumber(s.groups, locale)],
    [t('sumTrainees'), t('sumTraineesValue', { trainees: s.trainees, parents: s.parentAccounts })],
    [t('sumSubscriptions'), t('sumSubscriptionsValue', { active: s.activeSubscriptions, ended: s.endedSubscriptions, none: s.withoutSubscription })],
    [t('sumPaid'), `${money(s.amountPaid)} · ${t('sumDue', { amount: money(s.amountDue) })}`],
  ];

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="space-y-5 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a href={`${base}/template`} download className={SECONDARY} data-testid="import-template">
            <Download size={16} />
            {t('downloadTemplate')}
          </a>
          <button type="button" onClick={start} disabled={!branches || emptyBranches.length === 0} className={PRIMARY} data-testid="import-open">
            <Upload size={16} />
            {t('import')}
          </button>
        </div>
        {branches && emptyBranches.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('noEmptyBranch')}</p>
        )}

        {history.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground/80">{t('history')}</h3>
            <ul className="space-y-2">
              {history.map((h) => (
                <li key={h.id} className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-foreground">
                    {t('historyLine', { branch: branchName(h.branchId) || '—', trainees: h.summary?.trainees ?? 0, captains: h.summary?.captains ?? 0, groups: h.summary?.groups ?? 0 })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(h.at, locale)}
                    {h.fileName ? ` · ${h.fileName}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/60 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-foreground">{t('dialogTitle')}</h2>
                <p className="text-sm text-muted-foreground">
                  {academyName}
                  {branchId && step !== 'branch' ? ` · ${branchName(branchId)}` : ''}
                </p>
              </div>
              <button type="button" onClick={close} aria-label={t('close')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              {step === 'branch' && (
                <fieldset>
                  <legend className="mb-3 text-sm font-medium text-foreground">{t('chooseBranch')}</legend>
                  <div className="space-y-2">
                    {branches!.map((b) => (
                      <label key={b.id} className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 ${b.isEmpty ? 'cursor-pointer border-input hover:bg-muted' : 'border-border opacity-60'} ${branchId === b.id ? 'border-primary bg-primary/10' : ''}`}>
                        <input type="radio" name="import-branch" value={b.id} disabled={!b.isEmpty} checked={branchId === b.id} onChange={() => setBranchId(b.id)} className="h-4 w-4 accent-primary" />
                        <span className="flex-1 text-sm text-foreground">{b.name}</span>
                        {!b.isEmpty && <span className="text-xs text-muted-foreground">{t('branchHasData')}</span>}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {(step === 'file' || step === 'checking') && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{t('fileHint')}</p>
                  <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" data-testid="import-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <button type="button" onClick={() => fileInput.current?.click()} disabled={step === 'checking'} className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-input px-4 py-8 text-center hover:bg-muted/60">
                    <FileSpreadsheet size={28} className="text-primary" />
                    <span className="text-sm font-medium text-foreground">{file ? file.name : t('chooseFile')}</span>
                    {file && <span className="text-xs text-muted-foreground">{t('changeFile')}</span>}
                  </button>
                </div>
              )}

              {step === 'checked' && checked && (
                checked.ok ? (
                  <div className="space-y-4" data-testid="import-ready">
                    <p className="flex items-center gap-2 font-semibold text-success">
                      <CheckCircle2 size={18} />
                      {t('ready')}
                    </p>
                    <dl className="divide-y divide-border rounded-xl border border-border">
                      {summaryLines(checked.summary).map(([k, v]) => (
                        <div key={k} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between">
                          <dt className="text-sm text-muted-foreground">{k}</dt>
                          <dd className="text-sm font-medium text-foreground">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">{t('moneyNote')}</p>
                  </div>
                ) : (
                  <div className="space-y-4" data-testid="import-problems">
                    <p className="flex items-center gap-2 font-semibold text-danger">
                      <AlertTriangle size={18} />
                      {t('problems', { count: checked.issues.length })}
                    </p>
                    <p className="text-sm text-muted-foreground">{t('problemsHint')}</p>
                    {checked.markedFile && (
                      <button type="button" onClick={() => downloadBase64(checked.markedFile!, t('markedFileName', { name: file?.name.replace(/\.xlsx$/i, '') ?? 'import' }))} className={SECONDARY}>
                        <Download size={16} />
                        {t('downloadMarked')}
                      </button>
                    )}
                    <ul className="space-y-2">
                      {checked.issues.slice(0, 100).map((i, n) => (
                        <li key={n} className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2">
                          {where(i) && <p className="text-xs font-semibold text-foreground/80">{where(i)}</p>}
                          <p className="text-sm text-foreground">{issueText(i)[locale === 'ar' ? 'ar' : 'en']}</p>
                        </li>
                      ))}
                    </ul>
                    {checked.issues.length > 100 && <p className="text-xs text-muted-foreground">{t('moreProblems', { count: checked.issues.length - 100 })}</p>}
                  </div>
                )
              )}

              {step === 'importing' && (
                <p className="flex items-center gap-3 py-6 text-sm text-foreground" role="status">
                  <Loader2 size={18} className="animate-spin text-primary" />
                  {t('importing')}
                </p>
              )}

              {step === 'done' && done && (
                <div className="space-y-4" data-testid="import-done">
                  <p className="flex items-center gap-2 font-semibold text-success">
                    <CheckCircle2 size={18} />
                    {t('done', { trainees: done.summary.trainees })}
                  </p>
                  <div className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-3">
                    <p className="flex items-center gap-2 text-sm font-semibold text-warning">
                      <KeyRound size={16} />
                      {t('credentialsTitle')}
                    </p>
                    <p className="mt-1 text-sm text-foreground">{t('credentialsHint')}</p>
                  </div>
                  {done.sessionWarnings.length > 0 && <p className="text-xs text-muted-foreground">{t('sessionWarning')}</p>}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
              {step === 'branch' && (
                <button type="button" onClick={() => setStep('file')} disabled={!branchId} className={PRIMARY}>
                  {t('next')}
                </button>
              )}
              {(step === 'file' || step === 'checking') && (
                <>
                  {(branches?.length ?? 0) > 1 && (
                    <button type="button" onClick={() => setStep('branch')} disabled={step === 'checking'} className={SECONDARY}>
                      {t('back')}
                    </button>
                  )}
                  <button type="button" onClick={runCheck} disabled={!file || step === 'checking'} className={PRIMARY} data-testid="import-check">
                    {step === 'checking' && <Loader2 size={16} className="animate-spin" />}
                    {step === 'checking' ? t('checking') : t('check')}
                  </button>
                </>
              )}
              {step === 'checked' && checked && (
                <>
                  <button type="button" onClick={() => setStep('file')} className={SECONDARY}>
                    {t('otherFile')}
                  </button>
                  {checked.ok && (
                    <button type="button" onClick={runImport} className={PRIMARY} data-testid="import-confirm">
                      {t('confirm', { trainees: checked.summary.trainees })}
                    </button>
                  )}
                </>
              )}
              {step === 'done' && done && (
                <>
                  <button type="button" onClick={close} className={SECONDARY}>
                    {t('close')}
                  </button>
                  <button type="button" onClick={() => downloadBase64(done.credentials, t('credentialsFileName', { branch: branchName(branchId!) }))} className={PRIMARY} data-testid="import-credentials">
                    <Download size={16} />
                    {t('downloadCredentials')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
