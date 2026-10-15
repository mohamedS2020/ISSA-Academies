/**
 * The landing page's scroll animation, built on Motion. Loaded after
 * hydration by <LandingMotion />, and never when reduced motion is requested.
 *
 * - The server HTML is the finished page, so nothing here is needed to read
 *   it. The hero's opening runs in CSS from first paint (marketing.css,
 *   "Motion"); this file does everything else.
 * - Only what is still below the viewport at start-up gets a starting state.
 *   It animates once, when 20% of it is visible, and never hides again.
 *   Anything already on screen is left as it is.
 * - Transform and opacity, plus SVG strokes for line drawing and the FAQ's
 *   height on click. Counters hold their width, so nothing shifts.
 * - Horizontal motion follows the reading direction (mirrored in Arabic).
 * - Lighter on phones: shorter distances, no parallax.
 */

import { animate, scroll, stagger, type AnimationPlaybackControlsWithThen } from 'motion';
import { castPanel } from './acting';
import { PANEL_SHOWN_EVENT } from './events';
import { EASE, POP, Scope } from './kit';

/** Two-column hero, as in marketing.css. */
const WIDE = '(min-width: 961px)';
/** The three steps side by side, as in marketing.css. */
const STEPS_IN_A_ROW = '(min-width: 821px)';
const PHONE = '(max-width: 767px)';

const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  root.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll<T>(selector));
const matches = (query: string) => window.matchMedia(query).matches;

export function startLandingMotion(): () => void {
  const phone = matches(PHONE);
  const scope = new Scope({
    dir: document.documentElement.dir === 'rtl' ? -1 : 1,
    fold: window.innerHeight,
    distance: phone ? 16 : 24,
    duration: phone ? 0.6 : 0.7,
  });

  // Decorations that only make sense while this runs (the scroll lines).
  const html = document.documentElement;
  html.classList.add('ya-motion');
  scope.onRestore(() => html.classList.remove('ya-motion'));

  navProgress(scope);
  hero(scope);
  reveals(scope);
  platform(scope);
  roles(scope);
  bento(scope);
  steps(scope);
  pricing(scope);
  faq(scope);
  cta(scope);

  return () => scope.finish();
}

/** Ties a scroll-linked animation's lifetime to the scope. */
function link(scope: Scope, animation: AnimationPlaybackControlsWithThen, options?: Parameters<typeof scroll>[1]) {
  const unlink = scroll(animation, options);
  scope.onDispose(() => {
    unlink();
    animation.cancel();
  });
}

function flag(scope: Scope, el: HTMLElement, name: string) {
  el.dataset[name] = '';
  scope.onRestore(() => delete el.dataset[name]);
}

// ─── 1. Nav: progress line ──────────────────────────────────
// (Hiding on scroll down is in site-nav.tsx.)

function navProgress(scope: Scope) {
  const bar = $('.nav-progress > span');
  if (bar) link(scope, animate(bar, { transform: ['scaleX(0)', 'scaleX(1)'] }, { ease: 'linear' }));
}

// ─── 2–3. Hero and the sports roll call ─────────────────────

function hero(scope: Scope) {
  const section = $('.hero');
  const visual = section && $('.hero-visual', section);
  if (!section || !visual) return;
  const att = $('.ui-att', visual);
  const pay = $('.ui-pay', visual);
  const toast = $('.ui-toast', visual);
  const attFigure = att && $('[data-count]', att);
  const payFigure = pay && $('[data-count]', pay);

  if (matches(WIDE)) {
    // The opening is CSS. Its figures count up as the cards arrive, when
    // this code is here before they do.
    countWithEntrance(scope, att, attFigure);
    countWithEntrance(scope, pay, payFigure);
    // Scrolling away, the cards drift up slower than the text and fade a little.
    link(scope, animate(visual, { transform: ['none', 'translateY(60px)'], opacity: [1, 0.6] }, { ease: 'linear' }), {
      target: section,
      offset: ['start start', 'end start'],
    });
    return;
  }

  // One column: the sports and the cards sit under the copy, so they play
  // when scrolled to.
  const sports = $('.sports-wrap', section);
  if (scope.belowFold(sports)) {
    const names = $$('li', sports);
    scope.hide(names, { opacity: '.2', transform: 'scale(.94)' });
    scope.whenVisible(
      [sports],
      () =>
        scope.tween(names, { opacity: [0.2, 1], transform: ['scale(.94)', 'none'] }, { duration: 0.5, delay: stagger(0.09) }),
      0.5
    );
  }

  if (!scope.belowFold(visual)) return;
  const tilt = 3 * scope.env.dir;
  const tilted = (degrees: number) => `translateY(${scope.env.distance}px) rotate(${degrees}deg)`;
  const bar = att && $('.bar > span', att);
  const note = $('.sample-note', visual);
  const attCounter = scope.counter(attFigure, 0);
  const payCounter = scope.counter(payFigure, 0);
  scope.hide([att], { opacity: '0', transform: tilted(-tilt) });
  scope.hide([pay], { opacity: '0', transform: tilted(tilt) });
  scope.hide([toast], { opacity: '0', transform: 'translateY(10px) scale(.92)' });
  scope.hide([note], { opacity: '0' });
  scope.hide([bar], { transform: 'scaleX(0)' });
  scope.whenVisible([visual], () => {
    scope.tween(att, { opacity: [0, 1], transform: [tilted(-tilt), 'none'] }, { duration: 0.8 });
    scope.tween(pay, { opacity: [0, 1], transform: [tilted(tilt), 'none'] }, { duration: 0.8, delay: 0.18 });
    scope.tween(bar, { transform: ['scaleX(0)', 'none'] }, { duration: 1, delay: 0.25 });
    scope.count(attCounter, { delay: 0.25 });
    scope.count(payCounter, { delay: 0.43 });
    scope.tween(note, { opacity: [0, 1] }, { delay: 0.4 });
    // About 1.5 s later, the toast pops in like a live notification.
    scope.tween(
      toast,
      { opacity: [0, 1], transform: ['translateY(10px) scale(.92)', 'none'] },
      { duration: 0.6, delay: 1.7, ease: POP }
    );
  });
}

/** Counts a hero figure up with its card's CSS entrance, if the card has not appeared yet. */
function countWithEntrance(scope: Scope, card: HTMLElement | null, figure: HTMLElement | null) {
  if (!card || !figure || typeof CSSAnimation === 'undefined') return;
  const entrance = card
    .getAnimations()
    .find((animation): animation is CSSAnimation => animation instanceof CSSAnimation && animation.animationName.startsWith('ya-hero'));
  if (!entrance) return;
  const delay = Number(entrance.effect?.getTiming().delay ?? 0);
  const wait = delay - Number(entrance.currentTime ?? 0);
  if (!(wait >= 100)) return; // already showing: keep the finished figure
  const counter = scope.counter(figure, 0);
  scope.later((wait + 250) / 1000, () => scope.count(counter));
}

// ─── Plain reveals (section headings and single blocks) ─────

function reveals(scope: Scope) {
  const items = $$('.reveal').filter((el) => scope.belowFold(el));
  scope.lower(items);
  scope.whenVisible(items, (batch) => scope.rise(batch as HTMLElement[], { delay: stagger(0.08) }));
}

// ─── 4. "One platform" card ─────────────────────────────────

function platform(scope: Scope) {
  const section = $('#platform');
  const card = section && $('.platform-card', section);
  const heroSection = $('.hero');
  if (!section || !card) return;

  // On wide screens the card rises over the hero's edge in step with the
  // scroll, from the offset marketing.css starts it at. Narrower, it fades up.
  const wide = window.matchMedia(WIDE);
  let unlink: (() => void) | null = null;
  const linkRise = () => {
    unlink?.();
    unlink = null;
    if (!wide.matches || !heroSection) return;
    scope.clear(card);
    const rise = animate(card, { transform: ['translateY(60px)', 'none'] }, { ease: 'linear' });
    const stop = scroll(rise, { target: heroSection, offset: ['start start', 'center start'] });
    unlink = () => {
      stop();
      rise.cancel();
    };
  };
  linkRise();
  wide.addEventListener('change', linkRise);
  scope.onDispose(() => {
    wide.removeEventListener('change', linkRise);
    unlink?.();
  });
  if (!wide.matches && scope.belowFold(card)) {
    scope.lower([card]);
    scope.whenVisible([card], () => {
      if (!wide.matches) scope.rise([card]);
    });
  }

  // The four features stagger in, their icons drawing themselves.
  const features = $$('.features4 > li', section).filter((el) => scope.belowFold(el));
  const icons = new Map(features.map((li) => [li, $$<SVGGeometryElement>('.icon-tile svg :is(path, rect, circle)', li)]));
  scope.lower(features);
  icons.forEach((shapes) => shapes.forEach((shape) => scope.undraw(shape)));
  scope.whenVisible(features, (batch) =>
    batch.forEach((li, index) => {
      const delay = index * 0.08;
      scope.rise([li as HTMLElement], { delay });
      icons.get(li as HTMLElement)?.forEach((shape) =>
        scope.draw(shape, shape.getTotalLength(), { delay: delay + 0.2, duration: 0.9 })
      );
    })
  );
}

// ─── 5. Role switcher: each panel acts out its job ──────────
// (Auto-play and the crossfade are in role-switcher.tsx.)

function roles(scope: Scope) {
  const showcase = $('.showcase');
  if (!showcase) return;
  const stage = scope.child(); // one panel acts at a time
  let switched = false;

  const onShown = (event: Event) => {
    if (!(event.target instanceof HTMLElement)) return;
    switched = true;
    stage.finish();
    castPanel(event.target, stage)?.();
  };
  document.addEventListener(PANEL_SHOWN_EVENT, onShown);
  scope.onDispose(() => document.removeEventListener(PANEL_SHOWN_EVENT, onShown));

  // The first panel acts when the showcase first comes on screen.
  const first = $('.panel[data-state="active"]', showcase);
  if (first && scope.belowFold(showcase)) {
    const play = castPanel(first, stage);
    scope.whenVisible(
      [showcase],
      () => {
        if (!switched) play?.();
      },
      0.35
    );
  }
}

// ─── 6. Bento ───────────────────────────────────────────────

function bento(scope: Scope) {
  const section = $('#why');
  if (!section) return;
  const tiles = $$('.bento > .tile', section).filter((el) => scope.belowFold(el));
  if (tiles.length === 0) return;
  scope.lower(tiles);
  const extras = new Map<Element, (delay: number) => void>();

  // "4" counts up from 1, and the role chips pop in one at a time.
  const portals = $('.tile-portals', section);
  if (portals && tiles.includes(portals)) {
    const number = scope.counter($('[data-count]', portals), 1);
    const chips = $$('.portal-chips > span', portals);
    scope.hide(chips, { opacity: '0', transform: 'scale(.5)' });
    extras.set(portals, (delay) => {
      scope.count(number, { delay: delay + 0.15, duration: 0.9 });
      scope.tween(
        chips,
        { opacity: [0, 1], transform: ['scale(.5)', 'none'] },
        { duration: 0.45, ease: POP, delay: stagger(0.1, { startDelay: delay + 0.35 }) }
      );
    });
  }

  // The subdomain types itself out.
  const brand = $('.tile-brand', section);
  const slug = brand && $('.url-pill b', brand);
  if (brand && slug && tiles.includes(brand)) extras.set(brand, typeOut(scope, slug));

  // The chart line draws itself: left to right, or right to left in Arabic,
  // where the chart is mirrored.
  const money = $('.tile-money', section);
  const line = money && $<SVGGeometryElement>('.spark-line', money);
  const area = money && $<SVGElement>('.spark-area', money);
  if (money && line && tiles.includes(money)) {
    const length = scope.undraw(line, screenLength(line));
    if (area) scope.set(area, { opacity: '0' });
    extras.set(money, (delay) => {
      scope.draw(line, length, { delay: delay + 0.3, duration: 1.4 });
      if (area) scope.value(area, 'opacity', 0, 1, { delay: delay + 1, duration: 0.8 });
    });
  }

  scope.whenVisible(tiles, (batch) =>
    batch.forEach((tile, index) => {
      const delay = index * 0.08;
      scope.rise([tile as HTMLElement], { delay });
      extras.get(tile)?.(delay);
    })
  );
}

/**
 * Types a word out, like someone typing it, and returns the function that
 * plays it. The letters are on the page from the start, only transparent, so
 * nothing around them moves; afterwards the word is plain text again.
 */
function typeOut(scope: Scope, el: HTMLElement): (delay: number) => void {
  const original = Array.from(el.childNodes);
  const letters = Array.from(el.textContent ?? '', (character) => {
    const letter = document.createElement('span');
    letter.textContent = character;
    letter.style.opacity = '0';
    return letter;
  });
  const caret = document.createElement('span');
  caret.className = 'ya-caret';
  caret.setAttribute('aria-hidden', 'true');
  el.replaceChildren(...letters, caret);
  const restore = () => el.replaceChildren(...original);
  scope.onRestore(restore);

  return (delay) => {
    const start = delay + 0.4;
    const step = 0.07;
    letters.forEach((letter, index) =>
      scope.later(start + index * step, () => {
        letter.style.opacity = '1';
        caret.style.transform = `translateX(${letter.offsetLeft + letter.offsetWidth}px)`;
      })
    );
    // A couple of blinks, then the caret goes.
    scope.later(start + letters.length * step + 0.1, () => {
      scope.tween(caret, { opacity: [1, 0, 1, 0] }, { duration: 1.2, ease: 'linear' });
      scope.later(1.25, restore);
    });
  };
}

/**
 * The path's length on screen. The chart's line keeps a constant width
 * (non-scaling stroke), so its dashes are measured in screen pixels rather
 * than in the stretched SVG's own units.
 */
function screenLength(path: SVGGeometryElement): number {
  const total = path.getTotalLength();
  const matrix = path.getScreenCTM();
  if (!matrix) return total;
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const scaleY = Math.hypot(matrix.c, matrix.d);
  let length = 0;
  let previous = path.getPointAtLength(0);
  for (let step = 1; step <= 100; step++) {
    const point = path.getPointAtLength((total * step) / 100);
    length += Math.hypot((point.x - previous.x) * scaleX, (point.y - previous.y) * scaleY);
    previous = point;
  }
  return length;
}

// ─── 7. How it works: the connecting line ───────────────────

function steps(scope: Scope) {
  const track = $('.steps-track');
  if (!track) return;
  const fill = $('.steps-rail-fill', track);
  const items = $$('.step', track);
  if (!scope.belowFold(track)) {
    // Already on screen: show the line drawn, the steps as they are.
    if (fill) scope.set(fill, { transform: 'none' });
    return;
  }

  const lit = new Set<Element>();
  const light = (step: HTMLElement) => {
    if (lit.has(step)) return;
    lit.add(step);
    scope.tween(step, { opacity: [0.35, 1] }, { duration: 0.6 });
  };
  scope.hide(items, { opacity: '.35' });

  if (fill && matches(STEPS_IN_A_ROW)) {
    // The line follows the scroll (it never shrinks back), and each step
    // lights up as the line reaches its dot: the first, the middle, the last.
    let drawn = 0;
    scope.onDispose(
      scroll(
        (progress: number) => {
          if (progress <= drawn) return;
          drawn = progress;
          scope.set(fill, { transform: `scaleX(${drawn})` });
          items.forEach((step, index) => {
            if (drawn >= Math.max(0.01, index / (items.length - 1) - 0.02)) light(step);
          });
        },
        { target: track, offset: ['start 0.8', 'end 0.55'] }
      )
    );
  } else {
    // Stacked on phones: no line; each step lights up as it comes into view.
    scope.whenVisible(
      items,
      (batch) => batch.forEach((step, index) => scope.later(index * 0.12, () => light(step as HTMLElement))),
      0.5
    );
  }
}

// ─── 8. Founding facts and pricing ──────────────────────────

function pricing(scope: Scope) {
  const section = $('#pricing');
  if (!section) return;

  const facts = $('.facts', section);
  if (scope.belowFold(facts)) {
    const words = $$('.w', facts);
    scope.hide(words, { opacity: '0', transform: 'translateY(.4em)' });
    scope.whenVisible([facts], () =>
      scope.tween(words, { opacity: [0, 1], transform: ['translateY(.4em)', 'none'] }, { duration: 0.6, delay: stagger(0.07) })
    );
  }

  const plans = $$('.plans > .plan', section).filter((el) => scope.belowFold(el));
  const distance = scope.env.distance * 1.5;
  scope.lower(plans, distance);
  scope.whenVisible(plans, (batch) =>
    batch.forEach((plan, index) => {
      const delay = index * 0.1;
      scope.rise([plan as HTMLElement], { delay, distance, duration: 0.8 });
      // One soft shine across the featured plan once it has settled.
      if (plan.classList.contains('plan-featured')) {
        scope.later(delay + 0.75, () => flag(scope, plan as HTMLElement, 'shine'));
      }
    })
  );
}

// ─── 9. FAQ: smooth open and close ──────────────────────────

function faq(scope: Scope) {
  for (const details of $$<HTMLDetailsElement>('#faq details')) {
    const summary = $('summary', details);
    if (!summary) continue;
    let running: AnimationPlaybackControlsWithThen | null = null;

    const settle = () => {
      delete details.dataset.state;
      details.style.removeProperty('height');
      details.style.removeProperty('overflow');
      running = null;
    };

    const onClick = (event: MouseEvent) => {
      event.preventDefault();
      running?.stop();
      const from = details.getBoundingClientRect().height;
      const closing = details.open && details.dataset.state !== 'closing';
      details.style.removeProperty('height');
      // Measure the height it is heading for.
      details.open = !closing;
      const to = details.getBoundingClientRect().height;
      details.open = true;
      details.dataset.state = closing ? 'closing' : 'opening';
      details.style.overflow = 'hidden';

      const animation = animate(details, { height: [`${from}px`, `${to}px`] }, { duration: 0.35, ease: EASE });
      running = animation;
      animation.then(() => {
        if (running !== animation) return; // a newer click took over
        if (closing) details.open = false;
        settle();
      });
    };

    summary.addEventListener('click', onClick);
    scope.onDispose(() => {
      summary.removeEventListener('click', onClick);
      running?.stop();
      if (details.dataset.state === 'closing') details.open = false;
      settle();
    });
  }
}

// ─── 10. CTA band ───────────────────────────────────────────

function cta(scope: Scope) {
  const band = $('.cta-band');
  if (!band) return;

  if (scope.belowFold(band)) {
    const eyebrow = $('.cta-copy .eyebrow', band);
    const words = $$('#cta-h .w', band);
    const rest = [$('.cta-copy .lead', band), $('.cta-or', band), $('.cta-copy .btn', band)];
    const fields = $$('.demo-form > :not(input[type="hidden"], .hp-field)', band);
    const small = Math.round(scope.env.distance * 0.66);
    scope.lower([band]);
    scope.lower([eyebrow, ...rest, ...fields], small);
    scope.hide(words, { opacity: '0', transform: 'translateY(.4em)' });
    scope.whenVisible([band], () => {
      scope.rise([band]);
      scope.rise([eyebrow], { distance: small, delay: 0.15 });
      scope.tween(
        words,
        { opacity: [0, 1], transform: ['translateY(.4em)', 'none'] },
        { duration: 0.6, delay: stagger(0.07, { startDelay: 0.25 }) }
      );
      scope.rise(rest, { distance: small, delay: stagger(0.08, { startDelay: 0.3 + words.length * 0.07 }) });
      scope.rise(fields, { distance: small, delay: stagger(0.07, { startDelay: 0.35 }) });
    });
  }

  // The faint logo in the background drifts slowly with the scroll.
  const deco = $('.deco', band);
  if (deco && matches(WIDE)) {
    const tilt = 6 * scope.env.dir;
    link(
      scope,
      animate(
        deco,
        { transform: [`translateY(40px) rotate(${-tilt}deg)`, `translateY(-40px) rotate(${tilt}deg)`] },
        { ease: 'linear' }
      ),
      { target: band, offset: ['start end', 'end start'] }
    );
  }
}
