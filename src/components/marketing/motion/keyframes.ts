/**
 * Resting values for transform keyframes.
 *
 * Motion turns a `'none'` keyframe into the zero of the keyframe next to it, so
 * `['scale(.5)', 'none']` ends at `scale(0)`: the element shrinks away instead of
 * settling at full size. That is how the role chips in "Why Yallacademy"
 * vanished. A translate hid it, because `translateY(0px)` is where it rests
 * anyway. `restingTransform` writes out what `'none'` means here instead: each
 * transform function at its identity value.
 */

import type { DOMKeyframesDefinition } from 'motion';

const RESTING: [RegExp, string][] = [
  [/^scale(X|Y|Z|3d)?$/, '1'],
  [/^(rotate(X|Y|Z)?|skew(X|Y)?)$/, '0deg'],
  [/^translate(X|Y|Z|3d)?$/, '0px'],
];

/**
 * `'translateY(10px) scale(.92)'` → `'translateY(0px) scale(1)'`. A transform
 * with a function this doesn't know (`matrix`, `rotate3d`, …) gives `'none'`.
 */
export function restingTransform(transform: string): string {
  let known = true;
  const resting = transform.replace(/([a-zA-Z0-9]+)\(([^)]*)\)/g, (_, name: string, args: string) => {
    const value = RESTING.find(([pattern]) => pattern.test(name))?.[1];
    if (!value) known = false;
    return `${name}(${args.split(',').map(() => value).join(', ')})`;
  });
  return known ? resting : 'none';
}

/** The same keyframes, with a transform that ends on `'none'` ending at rest instead. */
export function settle(keyframes: DOMKeyframesDefinition): DOMKeyframesDefinition {
  const transform: unknown = keyframes.transform;
  if (!Array.isArray(transform) || transform.length < 2) return keyframes;
  const first: unknown = transform[0];
  if (transform[transform.length - 1] !== 'none' || typeof first !== 'string') return keyframes;
  return { ...keyframes, transform: [...transform.slice(0, -1), restingTransform(first)] };
}
