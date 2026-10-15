import type { CSSProperties } from 'react';
import { isSpace, splitWords } from './split-words';

/**
 * A phrase as one span per word (`.w`), for word-by-word reveals. The spaces
 * stay plain text, so the phrase wraps, reads and indexes exactly as before;
 * the spans only matter once the reveal styles apply. `--i` numbers the words
 * from `start`, for staggered delays in CSS.
 */
export function Words({ text, start = 0 }: { text: string; start?: number }) {
  let index = start;
  return (
    <>
      {splitWords(text).map((token, position) =>
        isSpace(token) ? (
          token
        ) : (
          <span key={position} className="w" style={{ '--i': index++ } as CSSProperties}>
            {token}
          </span>
        )
      )}
    </>
  );
}
