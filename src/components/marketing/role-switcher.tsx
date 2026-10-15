'use client';

/**
 * The "Four roles, one platform" switcher: accessible tabs (WAI-ARIA tabs
 * pattern) over panels that are rendered on the server. Every panel stays in
 * the HTML (the inactive ones are hidden with CSS), so all four are indexable.
 *
 * While it is on screen it plays itself: every 5 seconds the next tab opens,
 * with a progress line filling under the active one (the CSS animation's end
 * moves it on). It stops for good the moment the visitor hovers, focuses or
 * clicks a tab, and never runs when reduced motion is requested. The panels
 * share one grid cell and crossfade, so switching never changes the page's
 * height.
 */

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PANEL_SHOWN_EVENT } from './motion/events';
import { REDUCED_MOTION, useMediaQuery, usePageVisible } from './motion/use-media-query';

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
  const [interacted, setInteracted] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const reduceMotion = useMediaQuery(REDUCED_MOTION, true);
  const pageVisible = usePageVisible();
  const autoplay = !reduceMotion && !interacted;
  const showcaseRef = useRef<HTMLDivElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const shownRef = useRef(selected);

  // "On screen": at least a third of the showcase is visible.
  useEffect(() => {
    const showcase = showcaseRef.current;
    if (!autoplay || !showcase) return;
    const observer = new IntersectionObserver(
      ([entry]) => setOnScreen(entry.isIntersecting && entry.intersectionRatio >= 0.34),
      { threshold: [0, 0.35] }
    );
    observer.observe(showcase);
    return () => observer.disconnect();
  }, [autoplay]);

  // Tell the page's motion code which panel just opened, before it paints,
  // so the panel starts from its first frame.
  useLayoutEffect(() => {
    if (shownRef.current === selected) return;
    shownRef.current = selected;
    document
      .getElementById(`panel-${tabs[selected].id}`)
      ?.dispatchEvent(new CustomEvent(PANEL_SHOWN_EVENT, { bubbles: true }));
  }, [selected, tabs]);

  // On phones the tab row scrolls sideways: keep the open tab in view. Only
  // the row scrolls, never the page.
  useEffect(() => {
    const list = tablistRef.current;
    const tab = tabRefs.current[selected];
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const listBox = list.getBoundingClientRect();
    const tabBox = tab.getBoundingClientRect();
    const behavior = reduceMotion ? 'auto' : 'smooth';
    const margin = 16;
    if (tabBox.left < listBox.left) list.scrollBy({ left: tabBox.left - listBox.left - margin, behavior });
    else if (tabBox.right > listBox.right) list.scrollBy({ left: tabBox.right - listBox.right + margin, behavior });
  }, [selected, reduceMotion]);

  const stopAutoplay = () => setInteracted(true);

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
    <div className="showcase reveal" ref={showcaseRef}>
      <div
        ref={tablistRef}
        className="tabs"
        role="tablist"
        aria-label={tablistLabel}
        data-autoplay={autoplay ? (onScreen && pageVisible ? 'running' : 'paused') : undefined}
        onPointerEnter={stopAutoplay}
        onFocus={stopAutoplay}
      >
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
            onClick={() => {
              stopAutoplay();
              setSelected(index);
            }}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.icon}
            {tab.label}
            <span
              className="tab-progress"
              aria-hidden="true"
              onAnimationEnd={() => setSelected((current) => (current + 1) % tabs.length)}
            />
          </button>
        ))}
      </div>

      <div className="panels">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className="panel"
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            data-state={index === selected ? 'active' : 'inactive'}
          >
            {tab.panel}
          </div>
        ))}
      </div>
      <p className="sample-note">{sampleNote}</p>
    </div>
  );
}
