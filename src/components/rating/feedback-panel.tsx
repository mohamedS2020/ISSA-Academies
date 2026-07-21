'use client';

/**
 * ISSA — Captain Feedback panel (reusable)
 *
 * Lists a trainee's captain-feedback history (newest first). When `canWrite`
 * is set (the trainee's own captain), it also shows a composer to add a new
 * entry. Same GET endpoint serves captains (own trainees) and admin/mod
 * (any trainee) — the API decides what each role may read.
 */

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth/auth-context';
import { useToast } from '@/components/feedback/toast-provider';
import { Send, Loader2 } from 'lucide-react';

interface FeedbackEntry {
  id: string;
  message: string;
  createdAt: string;
  captain: { user: { name: string } };
}

export function FeedbackPanel({
  traineeId,
  canWrite = false,
}: {
  traineeId: string;
  canWrite?: boolean;
}) {
  const t = useTranslations('feedback');
  const tCommon = useTranslations('common');
  const { authFetch } = useAuth();
  const { toast } = useToast();

  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchFeedback = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}/feedback`);
      if (!res.ok) throw new Error('Failed to load feedback');
      setEntries((await res.json()).data ?? []);
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsLoading(false);
    }
  }, [authFetch, traineeId, toast, tCommon]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleSubmit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      const res = await authFetch(`/api/trainees/${traineeId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      if (!res.ok) throw new Error('Failed to submit feedback');
      setMessage('');
      toast.success(t('added'));
      fetchFeedback();
    } catch (err: any) {
      toast.error(err.message || tCommon('somethingWentWrong'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="space-y-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('writePlaceholder')}
            className="w-full px-3 py-2 bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300/60 dark:border-slate-600/60 rounded-xl text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none focus:border-primary/60 transition-all resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSaving || !message.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-white text-xs font-semibold disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {t('addButton')}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-primary dark:text-primary" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-xs text-slate-500 text-center py-6">{t('empty')}</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map((f) => (
            <div key={f.id} className="p-3 rounded-xl bg-slate-200/50 dark:bg-slate-800/40 border border-slate-300/40 dark:border-slate-700/40">
              <p className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {f.message}
              </p>
              <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
                <span className="font-semibold">{f.captain.user.name}</span>
                <span className="font-mono">{new Date(f.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
