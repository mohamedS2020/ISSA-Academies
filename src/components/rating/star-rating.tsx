'use client';

/**
 * ISSA — Star Rating primitives
 *
 *  · RatingBadge  — compact read-only "★ 4.5 (3)" badge shown beside a captain's
 *                   name (dashboard header, captains list/detail).
 *  · StarRating   — interactive 5-star input for the trainee portal (editable),
 *                   or a read-only star row when `onRate` is omitted.
 */

import { useState } from 'react';
import { Star } from 'lucide-react';

export function RatingBadge({
  average,
  count,
  size = 12,
  className = '',
}: {
  average: number | null;
  count?: number;
  size?: number;
  className?: string;
}) {
  if (average === null) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 ${className}`}
      >
        <Star size={size} className="text-slate-500 dark:text-slate-600" />
        <span>—</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 ${className}`}
    >
      <Star size={size} className="fill-amber-400 text-amber-600 dark:text-amber-400" />
      <span>{average.toFixed(1)}</span>
      {count !== undefined && count > 0 && (
        <span className="text-slate-500 font-medium">({count})</span>
      )}
    </span>
  );
}

export function StarRating({
  value,
  onRate,
  size = 28,
  disabled = false,
}: {
  value: number | null;
  onRate?: (stars: number) => void;
  size?: number;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !!onRate && !disabled;
  const active = hover ?? value ?? 0;

  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!interactive}
          onClick={() => interactive && onRate!(n)}
          onMouseEnter={() => interactive && setHover(n)}
          onMouseLeave={() => interactive && setHover(null)}
          aria-label={`${n}`}
          className={`transition-transform ${
            interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'
          } disabled:cursor-default`}
        >
          <Star
            size={size}
            className={n <= active ? 'fill-amber-400 text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-600'}
          />
        </button>
      ))}
    </div>
  );
}
