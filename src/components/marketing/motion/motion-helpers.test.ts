import { parseCount } from './count-format';
import { heroTiming } from './hero-timing';
import { splitWords, wordCount } from './split-words';

describe('splitWords', () => {
  it('splits on spaces and keeps them, so the text joins back unchanged', () => {
    const text = 'Run your academy.';
    expect(splitWords(text)).toEqual(['Run', ' ', 'your', ' ', 'academy.']);
    expect(splitWords(text).join('')).toBe(text);
  });

  it('splits Arabic into whole words, never letters', () => {
    expect(splitWords('واصنع أبطالك')).toEqual(['واصنع', ' ', 'أبطالك']);
    expect(wordCount('جاهز تدير أكاديميتك باحتراف؟')).toBe(4);
  });

  it('keeps a run of Latin words together inside Arabic text', () => {
    const text = 'استورد من Excel 2019 بسهولة';
    expect(splitWords(text)).toEqual(['استورد', ' ', 'من', ' ', 'Excel 2019', ' ', 'بسهولة']);
    expect(splitWords(text).join('')).toBe(text);
  });

  it('leaves a single Latin or number token in Arabic as its own word', () => {
    expect(splitWords('كرة قدم تحت 12')).toEqual(['كرة', ' ', 'قدم', ' ', 'تحت', ' ', '12']);
  });
});

describe('parseCount', () => {
  it.each([
    ['18 / 20', 18, 0, '0 / 20'],
    ['EGP 184,500', 184500, 1234.4, 'EGP 1,234'],
    ['184,500 ج.م', 184500, 99999, '99,999 ج.م'],
    ['EGP 184.5K', 184.5, 12.34, 'EGP 12.3K'],
    ['184.5 ألف ج.م', 184.5, 0, '0.0 ألف ج.م'],
    ['4', 4, 1, '1'],
  ])('%s', (text, value, current, formatted) => {
    const count = parseCount(text);
    expect(count?.value).toBe(value);
    expect(count?.format(current)).toBe(formatted);
    expect(count?.format(value)).toBe(text);
  });

  it('keeps Arabic-Indic digits and separators', () => {
    const count = parseCount('١٨٤٬٥٠٠ ج.م');
    expect(count?.value).toBe(184500);
    expect(count?.format(1500)).toBe('١٬٥٠٠ ج.م');
  });

  it('returns null when there is no number', () => {
    expect(parseCount('Free')).toBeNull();
  });
});

describe('heroTiming', () => {
  it('starts line 2 after a one-word pause and orders the sequence', () => {
    const { line2Start, style } = heroTiming(3, 3);
    expect(line2Start).toBe(4);
    const ms = (key: keyof typeof style) => Number.parseInt(style[key], 10);
    expect(ms('--hero-lead')).toBeGreaterThan(ms('--hero-words'));
    expect(ms('--hero-actions')).toBeGreaterThan(ms('--hero-lead'));
    expect(ms('--hero-card2')).toBeGreaterThan(ms('--hero-card1'));
    expect(ms('--hero-toast') - ms('--hero-card2')).toBe(1500);
  });
});
