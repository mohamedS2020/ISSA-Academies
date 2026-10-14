/**
 * Splits a phrase into words for word-by-word reveals. Words only, never
 * letters: splitting Arabic into letters breaks how they join.
 */

const RTL_CHAR = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const SPACE = /^\s+$/;

export const isSpace = (token: string) => SPACE.test(token);

/**
 * Words and the whitespace between them, in order, so joining the tokens gives
 * back the original text.
 *
 * In right-to-left text, a run of left-to-right words ("Excel 2019") stays in
 * one token. Each word is rendered as an inline block, and the bidi algorithm
 * treats inline blocks as neutral characters, so the words of a separate-token
 * Latin run would come out in reverse order inside an Arabic sentence.
 */
export function splitWords(text: string): string[] {
  const tokens = text.split(/(\s+)/).filter(Boolean);
  if (!RTL_CHAR.test(text)) return tokens;

  const merged: string[] = [];
  for (const token of tokens) {
    const space = merged.at(-1);
    const previous = merged.at(-2);
    const continuesLtrRun =
      !isSpace(token) &&
      !RTL_CHAR.test(token) &&
      space !== undefined &&
      isSpace(space) &&
      previous !== undefined &&
      !RTL_CHAR.test(previous);
    if (continuesLtrRun) {
      merged.pop();
      merged[merged.length - 1] += space + token;
    } else {
      merged.push(token);
    }
  }
  return merged;
}

export function wordCount(text: string): number {
  return splitWords(text).filter((token) => !isSpace(token)).length;
}
