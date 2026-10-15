/**
 * Sample figures shown in the landing page's product mockups. Labelled
 * "Sample data for illustration" on the page; identical in both languages, so
 * they live here rather than in the message files.
 *
 * The figures agree with each other across mockups: October's income (184,500)
 * is the hero's "collected this month", and October's net (99,800) is the
 * bento chart's latest point.
 */

/** Avatar colour: Deep Sea when not given. */
export type AvatarTone = 'lagoon' | 'midnight';

export const HERO_AVATARS: { label: string; tone?: AvatarTone }[] = [
  { label: 'K' },
  { label: 'L', tone: 'lagoon' },
  { label: 'H', tone: 'midnight' },
  { label: 'S' },
  { label: '+14', tone: 'lagoon' },
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
export const CAPTAIN_ROLL: { tone?: AvatarTone; done: boolean }[] = [
  { done: true },
  { tone: 'lagoon', done: true },
  { tone: 'midnight', done: true },
  { done: false },
  { tone: 'lagoon', done: true },
];

export const avatarClass = (tone?: AvatarTone) => (tone ? `avatar avatar-${tone}` : 'avatar');
