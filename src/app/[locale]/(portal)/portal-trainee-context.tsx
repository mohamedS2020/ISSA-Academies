'use client';

/**
 * ISSA — Portal Trainee Context
 *
 * A portal account (guardian, or a self-managing adult) can own several
 * trainees. This context loads the account's trainees and tracks which one is
 * currently selected, so every portal page renders that trainee's data. The
 * selected id is appended as `?traineeId=` to the portal API calls (which
 * validate ownership server-side).
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { Users, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth/auth-context';

export interface PortalTrainee {
  id: string;
  name: string;
  systemCode: string;
}

interface PortalTraineeCtx {
  trainees: PortalTrainee[];
  selectedTraineeId: string | null;
  setSelectedTraineeId: (id: string) => void;
}

const Ctx = createContext<PortalTraineeCtx>({
  trainees: [],
  selectedTraineeId: null,
  setSelectedTraineeId: () => {},
});

export const usePortalTrainee = () => useContext(Ctx);

export function PortalTraineeProvider({ children }: { children: React.ReactNode }) {
  const { authFetch } = useAuth();
  const [trainees, setTrainees] = useState<PortalTrainee[]>([]);
  const [selectedTraineeId, setSelectedTraineeId] = useState<string | null>(null);

  useEffect(() => {
    authFetch('/api/portal/trainees')
      .then((r) => r.json())
      .then((d) => {
        const list: PortalTrainee[] = d.data || [];
        setTrainees(list);
        setSelectedTraineeId((cur) => cur ?? list[0]?.id ?? null);
      })
      .catch(() => {});
  }, [authFetch]);

  return (
    <Ctx.Provider value={{ trainees, selectedTraineeId, setSelectedTraineeId }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * The switcher itself — only renders when the account manages more than one
 * trainee. Placed in the portal top bar.
 */
export function TraineeSwitcher() {
  const { trainees, selectedTraineeId, setSelectedTraineeId } = usePortalTrainee();
  if (trainees.length <= 1) return null;

  return (
    <div className="relative flex items-center gap-1.5 rounded-xl bg-slate-100/70 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 ps-2.5 pe-1.5 py-1.5">
      <Users size={14} className="text-primary dark:text-primary flex-shrink-0" />
      <select
        value={selectedTraineeId ?? ''}
        onChange={(e) => setSelectedTraineeId(e.target.value)}
        className="appearance-none bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none pe-4 cursor-pointer"
      >
        {trainees.map((t) => (
          <option key={t.id} value={t.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
            {t.name}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="text-slate-500 absolute end-2 pointer-events-none" />
    </div>
  );
}
