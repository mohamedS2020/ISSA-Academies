/**
 * Sample figures shown in the landing page's product mockups. Labelled
 * "Sample data for illustration" on the page; identical in both languages, so
 * they live here rather than in the message files.
 *
 * The figures agree with each other across mockups: October's income (184,500)
 * is the hero's "collected this month", and October's net (99,800) is the
 * bento chart's latest point.
 */

export const HERO_AVATARS: { label: string; background?: string }[] = [
  { label: 'K' },
  { label: 'L', background: 'var(--lagoon)' },
  { label: 'H', background: 'var(--midnight)' },
  { label: 'S' },
  { label: '+14', background: 'var(--lagoon)' },
];

export const HERO_COLLECTIONS = { paid: '412', dueThisWeek: '27', balanceDue: '9' };

/** One branch, month by month (August → October), then the total. */
export const OWNER_ROWS = [
  { income: '158,600', expenses: '79,400', net: '79,200' },
  { income: '171,200', expenses: '80,900', net: '90,300' },
  { income: '184,500', expenses: '84,700', net: '99,800' },
];
export const OWNER_TOTAL = { income: '514,300', expenses: '245,000', net: '269,300' };

/** Matches the moderator card's five permissions, in order. */
export const MODERATOR_PERMISSIONS_ON = [true, true, true, false, false];

/** Avatar colour and "notes written" state for the captain's five players. */
export const CAPTAIN_ROLL = [
  { background: 'var(--deepsea)', done: true },
  { background: 'var(--lagoon)', done: true },
  { background: 'var(--midnight)', done: true },
  { background: 'var(--deepsea)', done: false },
  { background: 'var(--lagoon)', done: true },
];
