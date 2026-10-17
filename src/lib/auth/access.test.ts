import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from '@jest/globals';
import { ACCESS, canAccess, type AccessKey } from './access';
import { MODERATOR_PRIVILEGES } from '@/types';
import { PRIVILEGE_GROUPS } from './privilege-groups';

const KEYS = Object.keys(ACCESS) as AccessKey[];

/** Every .ts/.tsx file under src, except tests and generated code. */
function sourceFiles(dir = path.resolve(process.cwd(), 'src')): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === 'generated' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('the access table (hardening plan §35)', () => {
  it('lets an admin do everything and other roles nothing', () => {
    for (const key of KEYS) {
      expect(canAccess({ role: 'ADMIN' }, key)).toBe(true);
      expect(canAccess({ role: 'CAPTAIN', privileges: [...MODERATOR_PRIVILEGES] }, key)).toBe(false);
      expect(canAccess({ role: 'TRAINEE', privileges: [...MODERATOR_PRIVILEGES] }, key)).toBe(false);
      expect(canAccess(null, key)).toBe(false);
    }
  });

  it('gives a moderator with no privileges nothing', () => {
    for (const key of KEYS) {
      expect(canAccess({ role: 'MODERATOR', privileges: [] }, key)).toBe(false);
      expect(canAccess({ role: 'MODERATOR' }, key)).toBe(false);
    }
  });

  it('gives a moderator exactly what one privilege grants', () => {
    const subject = { role: 'MODERATOR', privileges: ['can_mark_attendance'] };
    const granted = KEYS.filter((key) => canAccess(subject, key)).sort();
    // Marking includes seeing, and the attendance page lists today's sessions.
    expect(granted).toEqual(['markAttendance', 'viewAttendance', 'viewSchedule']);
  });

  it('lets a stronger privilege include the weaker one', () => {
    const pairs: [string, AccessKey, AccessKey][] = [
      ['can_manage_trainees', 'manageTrainees', 'viewTrainees'],
      ['can_manage_captains', 'manageCaptains', 'viewCaptains'],
      ['can_mark_attendance', 'markAttendance', 'viewAttendance'],
      ['can_manage_schedule', 'manageSchedule', 'viewSchedule'],
      ['can_manage_groups', 'manageGroups', 'viewGroups'],
      ['can_manage_subscriptions', 'recordPayments', 'viewSubscriptions'],
      ['can_manage_expenses', 'manageExpenses', 'viewExpenses'],
    ];
    for (const [privilege, strong, weak] of pairs) {
      const subject = { role: 'MODERATOR', privileges: [privilege] };
      expect([privilege, canAccess(subject, strong), canAccess(subject, weak)]).toEqual([
        privilege,
        true,
        true,
      ]);
    }
  });

  it('keeps money behind "View finances"', () => {
    const recorder = { role: 'MODERATOR', privileges: ['can_manage_expenses'] };
    expect(canAccess(recorder, 'viewExpenses')).toBe(true); // the lists they fill in
    expect(canAccess(recorder, 'viewFinances')).toBe(false); // not the P&L or revenue
  });

  it('keeps price plans admin-only: no moderator privilege edits them', () => {
    // There is deliberately no key for editing plans; routes use requireMinRole(ADMIN).
    expect(KEYS.some((key) => /plan/i.test(key) && key !== 'viewPlans')).toBe(false);
  });

  it('has no switch an owner can turn on that grants nothing', () => {
    const granting = new Set(KEYS.flatMap((key) => [...ACCESS[key]]));
    const dead = MODERATOR_PRIVILEGES.filter((privilege) => !granting.has(privilege));
    expect(dead).toEqual([]);
  });

  it('no longer offers "Manage users" or "Manage branches"', () => {
    const offered = Object.values(PRIVILEGE_GROUPS).flatMap((g) => [...g.privileges]);
    expect(offered).not.toContain('can_manage_users');
    expect(offered).not.toContain('can_manage_branches');
    expect([...MODERATOR_PRIVILEGES]).not.toContain('can_manage_users');
    expect([...MODERATOR_PRIVILEGES]).not.toContain('can_manage_branches');
    // And the settings grid offers exactly the privileges that exist.
    expect(offered.sort()).toEqual([...MODERATOR_PRIVILEGES].sort());
  });

  it('uses every access rule somewhere: a route, a page or the sidebar', () => {
    const code = sourceFiles()
      .filter((file) => !file.endsWith(path.join('lib', 'auth', 'access.ts')))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const unused = KEYS.filter((key) => !code.includes(`'${key}'`) && !code.includes(`"${key}"`));
    expect(unused).toEqual([]);
  });
});
