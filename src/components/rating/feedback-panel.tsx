'use client';

/**
 * Captain Feedback panel (reusable)
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
      if (!res.ok) throw new Error(tCommon('loadFailed'));
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
      if (!res.ok) throw new Error(t('submitFailed'));
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
            dir="auto"
            rows={3}
            maxLength={2000}
            placeholder={t('writePlaceholder')}
            className="w-full px-3 py-2 bg-muted/60 border border-input/60 rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-all resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={isSaving || !message.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
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
        <p className="text-xs text-muted-foreground text-center py-6">{t('empty')}</p>
      ) : (
        <div className="space-y-2.5">
          {entries.map((f) => (
            <div key={f.id} className="p-3 rounded-xl bg-muted/50 border border-input/40">
              {/* A coach writes in either language: each note takes its own direction. */}
              <p dir="auto" className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                {f.message}
              </p>
              <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                <span className="font-semibold">{f.captain.user.name}</span>
                <span className="font-mono" dir="ltr">{new Date(f.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
