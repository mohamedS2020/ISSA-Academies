/**
 * The role switcher's panels "act out" their job each time they open:
 * - Owner: the finance rows slide in and the figures count up.
 * - Moderator: the allowed permissions switch on one by one; the others stay off.
 * - Captain: the ticks appear one name at a time.
 * - Parent: the next session appears, then attendance fills, then "Paid" pops.
 *
 * `castPanel` puts a panel in its starting state and returns the function that
 * plays it. Finishing the scope jumps it to the end (the server-rendered panel).
 */

import { stagger } from 'motion';
import { POP, type Scope } from './kit';

type Cast = (panel: HTMLElement, scope: Scope) => () => void;

const owner: Cast = (panel, scope) => {
  const rows = Array.from(panel.querySelectorAll<HTMLElement>('.fin-table tbody tr, .fin-table tfoot tr'));
  const offset = `translateX(${-16 * scope.env.dir}px)`;
  const kpis = Array.from(panel.querySelectorAll<HTMLElement>('.kpi [data-count]'), (el) => scope.counter(el, 0));
  const cells = rows.map((row) =>
    Array.from(row.querySelectorAll<HTMLElement>('[data-count]'), (el) => scope.counter(el, 0))
  );
  scope.hide(rows, { opacity: '0', transform: offset });

  return () => {
    kpis.forEach((counter) => scope.count(counter, { delay: 0.15 }));
    rows.forEach((row, index) => {
      const delay = 0.25 + index * 0.1;
      scope.tween(row, { opacity: [0, 1], transform: [offset, 'none'] }, { delay, duration: 0.6 });
      cells[index].forEach((counter) => scope.count(counter, { delay, duration: 1 }));
    });
  };
};

const moderator: Cast = (panel, scope) => {
  const switches = Array.from(panel.querySelectorAll<HTMLElement>('.switch.on'));
  // Turn the allowed ones off without animating there (the panel may
  // already be fading in), then let the transitions back in.
  for (const toggle of switches) {
    toggle.dataset.instant = '';
    toggle.dataset.off = '';
  }
  void panel.offsetWidth;
  for (const toggle of switches) delete toggle.dataset.instant;
  scope.onRestore(() => switches.forEach((toggle) => delete toggle.dataset.off));

  return () => {
    switches.forEach((toggle, index) => scope.later(0.4 + index * 0.3, () => delete toggle.dataset.off));
  };
};

const captain: Cast = (panel, scope) => {
  const ticks = Array.from(panel.querySelectorAll<HTMLElement>('.roll .check:not(.off)'));
  scope.hide(ticks, { opacity: '0', transform: 'scale(.4)' });

  return () => {
    scope.tween(
      ticks,
      { opacity: [0, 1], transform: ['scale(.4)', 'none'] },
      { duration: 0.45, ease: POP, delay: stagger(0.28, { startDelay: 0.35 }) }
    );
  };
};

const parent: Cast = (panel, scope) => {
  const next = panel.querySelector<HTMLElement>('.ph-next2');
  const bar = panel.querySelector<HTMLElement>('.bar > span');
  const paid = panel.querySelector<HTMLElement>('.pill-ok');
  scope.hide([next], { opacity: '0', transform: 'translateY(12px)' });
  scope.hide([bar], { transform: 'scaleX(0)' });
  scope.hide([paid], { opacity: '0', transform: 'scale(.6)' });

  return () => {
    scope.tween(next, { opacity: [0, 1], transform: ['translateY(12px)', 'none'] }, { delay: 0.2, duration: 0.6 });
    scope.tween(bar, { transform: ['scaleX(0)', 'none'] }, { delay: 0.75, duration: 0.9 });
    scope.tween(paid, { opacity: [0, 1], transform: ['scale(.6)', 'none'] }, { delay: 1.6, duration: 0.45, ease: POP });
  };
};

const CAST: Record<string, Cast> = {
  'panel-owner': owner,
  'panel-moderator': moderator,
  'panel-captain': captain,
  'panel-parent': parent,
};

export function castPanel(panel: HTMLElement, scope: Scope): (() => void) | null {
  const cast = CAST[panel.id];
  return cast ? cast(panel, scope) : null;
}
