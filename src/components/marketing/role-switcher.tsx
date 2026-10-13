'use client';

/**
 * The "Four roles, one platform" switcher: accessible tabs (WAI-ARIA tabs
 * pattern) over panels that are rendered on the server. Every panel stays in
 * the HTML; the inactive ones carry `hidden`, so all four are indexable.
 */

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface RoleTab {
  id: string;
  label: string;
  icon: ReactNode;
  panel: ReactNode;
}

export function RoleSwitcher({
  tabs,
  tablistLabel,
  sampleNote,
}: {
  tabs: RoleTab[];
  tablistLabel: string;
  sampleNote: string;
}) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    // Arrow keys follow the reading direction: in Arabic, "next" is to the left.
    const rtl = document.documentElement.dir === 'rtl';
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    let target: number | null = null;
    if (event.key === nextKey) target = (index + 1) % tabs.length;
    if (event.key === prevKey) target = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target === null) return;
    event.preventDefault();
    setSelected(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <div className="showcase reveal">
      <div className="tabs" role="tablist" aria-label={tablistLabel}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className="tab"
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          className="panel"
          role="tabpanel"
          id={`panel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={index !== selected}
        >
          {tab.panel}
        </div>
      ))}
      <p className="sample-note">{sampleNote}</p>
    </div>
  );
}
