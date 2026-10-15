/**
 * A small toolkit over Motion for the landing page.
 *
 * A Scope remembers everything it changes (inline styles, counters' text,
 * temporary markup, timers, observers, running animations), so `finish()` can
 * put the page back to its finished, server-rendered state at any moment:
 * when a role panel replays, when reduced motion is switched on, or when the
 * page's motion is torn down.
 */

import {
  animate,
  inView,
  type AnimationOptions,
  type AnimationPlaybackControlsWithThen,
  type DOMKeyframesDefinition,
  type ValueAnimationTransition,
} from 'motion';
import { parseCount, type CountFormat } from './count-format';

/** The brand easing, cubic-bezier(.2, .7, .2, 1). */
export const EASE = [0.2, 0.7, 0.2, 1] as const;
/** A little overshoot, for things that pop in. */
export const POP = [0.34, 1.4, 0.64, 1] as const;

export type Target = HTMLElement | SVGElement;

export interface Env {
  /** 1 for left-to-right, -1 for right-to-left: multiplies every horizontal move. */
  dir: 1 | -1;
  /** Viewport height when the motion started. */
  fold: number;
  /** How far things rise, in pixels (shorter on phones). */
  distance: number;
  /** Default duration, in seconds. */
  duration: number;
}

export interface Counter {
  el: HTMLElement;
  final: string;
  format: CountFormat;
  from: number;
}

const inDocumentOrder = (a: Element, b: Element) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/** Updates React-rendered text in place, keeping React's own text node. */
function setText(el: HTMLElement, text: string) {
  const node = el.firstChild;
  if (node && node === el.lastChild && node.nodeType === Node.TEXT_NODE) node.nodeValue = text;
  else el.textContent = text;
}

export class Scope {
  private styled = new Map<Target, Set<string>>();
  private animations = new Set<AnimationPlaybackControlsWithThen>();
  private timers = new Set<number>();
  private counters = new Set<Counter>();
  private restorers: (() => void)[] = [];
  private disposers: (() => void)[] = [];

  constructor(readonly env: Env) {}

  /** A scope that can be finished on its own, and is finished with this one. */
  child(): Scope {
    const scope = new Scope(this.env);
    this.onDispose(() => scope.finish());
    return scope;
  }

  /** Entirely below the viewport, as it was when the motion started. */
  belowFold(el: Element | null | undefined): el is Element {
    return Boolean(el) && el!.getBoundingClientRect().top >= this.env.fold;
  }

  set(el: Target, styles: Record<string, string>) {
    let names = this.styled.get(el);
    if (!names) this.styled.set(el, (names = new Set()));
    for (const [name, value] of Object.entries(styles)) {
      el.style.setProperty(name, value);
      names.add(name);
    }
  }

  /** Gives each element a starting state. */
  hide(elements: Iterable<Target | null | undefined>, styles: Record<string, string>) {
    for (const el of elements) if (el) this.set(el, styles);
  }

  /** Removes the inline styles this scope set, handing the element back to the stylesheet. */
  clear(el: Target) {
    const names = this.styled.get(el);
    if (!names) return;
    for (const name of names) el.style.removeProperty(name);
    this.styled.delete(el);
  }

  private track(controls: AnimationPlaybackControlsWithThen, onDone: () => void) {
    this.animations.add(controls);
    controls.then(() => {
      this.animations.delete(controls);
      onDone();
    });
  }

  /** Animates transform/opacity, then hands the elements back to the stylesheet. */
  tween(elements: Target | (Target | null)[] | null, keyframes: DOMKeyframesDefinition, options: AnimationOptions = {}) {
    const list = (Array.isArray(elements) ? elements : [elements]).filter((el): el is Target => Boolean(el));
    if (list.length === 0) return;
    const controls = animate(list, keyframes, { duration: this.env.duration, ease: EASE, ...options });
    this.track(controls, () => list.forEach((el) => this.clear(el)));
  }

  /** Starting state for `rise`: transparent and lowered. */
  lower(elements: Iterable<Target | null | undefined>, distance = this.env.distance) {
    this.hide(elements, { opacity: '0', transform: `translateY(${distance}px)` });
  }

  /** Fades elements up into place (from `lower`). */
  rise(elements: (Target | null)[], options: AnimationOptions & { distance?: number } = {}) {
    const { distance = this.env.distance, ...rest } = options;
    this.tween(elements, { opacity: [0, 1], transform: [`translateY(${distance}px)`, 'none'] }, rest);
  }

  /** Animates one inline style property through numbers, for SVG properties Motion would set as attributes. */
  value(el: Target, property: string, from: number, to: number, options: ValueAnimationTransition<number> = {}) {
    this.set(el, { [property]: String(from) });
    const controls = animate(from, to, {
      duration: this.env.duration,
      ease: EASE,
      ...options,
      onUpdate: (current) => el.style.setProperty(property, String(current)),
    });
    this.track(controls, () => this.clear(el));
  }

  /** Hides an SVG stroke so `draw` can draw it; `length` is in the units its dashes use. */
  undraw(shape: SVGGeometryElement, length = shape.getTotalLength()) {
    // A gap longer than the dash, and an offset one unit past it, so a round
    // line cap can't leave a dot at the start.
    this.set(shape, { 'stroke-dasharray': `${length} ${length + 2}`, 'stroke-dashoffset': `${length + 1}` });
    return length;
  }

  draw(shape: SVGGeometryElement, length: number, options: ValueAnimationTransition<number> = {}) {
    this.value(shape, 'stroke-dashoffset', length + 1, 0, { duration: 0.9, ...options });
  }

  /**
   * Sets a counter to `from`, holding its finished width so nothing next to it
   * moves. A figure that wraps onto two lines (an Arabic amount in a narrow
   * card) doesn't count: holding its size would change how it wraps.
   */
  counter(el: HTMLElement | null, from: number): Counter | null {
    if (!el || el.getClientRects().length > 1) return null;
    const final = el.textContent ?? '';
    const format = parseCount(final);
    if (!format) return null;
    this.set(el, { display: 'inline-block', width: `${el.offsetWidth}px`, 'white-space': 'nowrap' });
    setText(el, format.format(from));
    const counter = { el, final, format, from };
    this.counters.add(counter);
    return counter;
  }

  count(counter: Counter | null, options: ValueAnimationTransition<number> = {}) {
    if (!counter) return;
    const controls = animate(counter.from, counter.format.value, {
      duration: 1.1,
      ease: EASE,
      ...options,
      onUpdate: (current) => setText(counter.el, counter.format.format(current)),
    });
    this.track(controls, () => this.restoreCounter(counter));
  }

  private restoreCounter(counter: Counter) {
    setText(counter.el, counter.final);
    this.clear(counter.el);
    this.counters.delete(counter);
  }

  later(seconds: number, callback: () => void) {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, seconds * 1000);
    this.timers.add(timer);
  }

  /**
   * Calls `onEnter` once per element, when `amount` of it is visible, then
   * stops watching it. Elements that come into view together arrive in one
   * batch, in page order, so they can be staggered.
   */
  whenVisible(elements: Element[], onEnter: (batch: Element[]) => void, amount = 0.2) {
    if (elements.length === 0) return;
    const pending = new Set(elements);
    let batch: Element[] = [];
    let frame = 0;
    const stop = inView(
      elements,
      (element) => {
        if (!pending.delete(element)) return;
        batch.push(element);
        if (pending.size === 0) stop();
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const ready = batch.sort(inDocumentOrder);
          batch = [];
          onEnter(ready);
        });
      },
      { amount }
    );
    this.onDispose(() => {
      stop();
      cancelAnimationFrame(frame);
    });
  }

  /** Undoes a temporary change to the page (run by `finish`, last change first). */
  onRestore(restore: () => void) {
    this.restorers.push(restore);
  }

  /** Stops a listener, observer or scroll link (run by `finish`). */
  onDispose(dispose: () => void) {
    this.disposers.push(dispose);
  }

  /** Stops everything and leaves the page exactly as the server rendered it. */
  finish() {
    for (const dispose of this.disposers.splice(0)) dispose();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    for (const controls of this.animations) controls.stop();
    this.animations.clear();
    for (const counter of [...this.counters]) this.restoreCounter(counter);
    for (const restore of this.restorers.splice(0).reverse()) restore();
    for (const el of [...this.styled.keys()]) this.clear(el);
  }
}
