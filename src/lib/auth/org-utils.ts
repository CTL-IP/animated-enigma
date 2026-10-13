import type { Role } from './rbac';

/**
 * A short, curated list rather than the full IANA database — a GC picks their
 * own time zone once, at setup, and needs to find it fast on a phone, not
 * page through three hundred options most of which don't apply to a US trade
 * business. `schedule-core.ts` only needs the zone name itself; this is just
 * what the onboarding picker shows for it.
 */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Mountain — no DST (Arizona)' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
] as const;

/** URL-safe slug from an organization name, with a random suffix for uniqueness. */
export function slugify(name: string, suffix: string = randomSuffix()): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return `${base || 'org'}-${suffix}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export interface MemberRoles {
  memberId: string;
  roles: readonly Role[];
  isActive: boolean;
}

/**
 * Guard against locking an organization out of administration: a role change
 * or deactivation must leave at least one other active member holding `owner`.
 */
export function wouldRemoveLastOwner(
  members: readonly MemberRoles[],
  targetMemberId: string,
  nextRoles: readonly Role[],
): boolean {
  const target = members.find((m) => m.memberId === targetMemberId);
  if (!target || !target.isActive || !target.roles.includes('owner')) return false;
  if (nextRoles.includes('owner')) return false;
  const otherOwners = members.filter(
    (m) => m.memberId !== targetMemberId && m.isActive && m.roles.includes('owner'),
  );
  return otherOwners.length === 0;
}
