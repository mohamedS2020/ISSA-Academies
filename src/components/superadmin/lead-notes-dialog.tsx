'use client';

/**
 * Edit a lead's notes. A small modal: focus moves into it, Escape and the
 * backdrop close it, and focus returns to whatever opened it.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { Lead } from './leads-api';

interface DialogProps {
  lead: Lead | null;
  labels: { title: string; placeholder: string; save: string; cancel: string };
  isSaving: boolean;
  onSave: (notes: string | null) => void;
  onClose: () => void;
}

export function LeadNotesDialog({ lead, ...props }: DialogProps) {
  if (!lead) return null;
  // Keyed by lead: the text box starts from that lead's notes, and switching
  // leads starts a fresh form instead of carrying unsaved text across.
  return <NotesForm key={lead.id} lead={lead} {...props} />;
}

function NotesForm({ lead, labels, isSaving, onSave, onClose }: DialogProps & { lead: Lead }) {
  const [notes, setNotes] = useState(lead.notes ?? '');
  // Whatever had focus when the dialog opened (the "Notes" button), read
  // during the first render, before focus moves into the dialog.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  // The latest onClose without re-running the effect below on every render
  // (the parent passes a new function each time).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Focus moves in on open and back to the opener on close. Done here rather
  // than with autoFocus so it stays right when effects run twice (React's
  // development check mounts, unmounts and remounts).
  useEffect(() => {
    textareaRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [opener]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <h3 id={titleId} className="text-lg font-semibold text-foreground">
          {labels.title}
        </h3>
        <textarea
          ref={textareaRef}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={labels.placeholder}
          maxLength={5000}
          rows={6}
          className="mt-4 w-full rounded-lg border border-input bg-background p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            {labels.cancel}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSave(notes.trim() === '' ? null : notes)}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {labels.save}
          </button>
        </div>
      </div>
    </div>
  );
}
