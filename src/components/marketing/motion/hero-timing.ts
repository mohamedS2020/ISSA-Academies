/**
 * The hero's opening sequence, timed from first paint. It runs in CSS (see
 * "Motion" in src/styles/marketing.css) so it starts before any JavaScript
 * loads; these delays depend on how many words the headline has, so the
 * server works them out per language and passes them as CSS variables.
 */

/** Milliseconds between one headline word and the next. */
export const HERO_WORD_STEP_MS = 70;

export interface HeroTiming {
  /** Index of line 2's first word: one step of pause after line 1. */
  line2Start: number;
  /** CSS custom properties for the hero section's style attribute. */
  style: Record<`--hero-${string}`, string>;
}

export function heroTiming(line1Words: number, line2Words: number): HeroTiming {
  const firstWord = 100;
  const line2Start = line1Words + 1;
  const lastWord = firstWord + (line2Start + line2Words - 1) * HERO_WORD_STEP_MS;
  const lead = lastWord + 80;
  const actions = lead + 100;
  const card1 = lead + 60;
  const card2 = card1 + 180;
  const bar = card1 + 250;
  const toast = card2 + 1500;
  const sports = actions + 450;

  const ms = (value: number) => `${value}ms`;
  return {
    line2Start,
    style: {
      '--hero-words': ms(firstWord),
      '--hero-step': ms(HERO_WORD_STEP_MS),
      '--hero-lead': ms(lead),
      '--hero-actions': ms(actions),
      '--hero-card1': ms(card1),
      '--hero-card2': ms(card2),
      '--hero-bar': ms(bar),
      '--hero-toast': ms(toast),
      '--hero-sports': ms(sports),
    },
  };
}
