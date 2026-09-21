import { getDb, uuid } from "./db";
import {
  addDays, daysBetween, daysUntilBirthday, todayISO, type ISODate,
} from "./dates";
import type { Person } from "./types";

/**
 * Who is overdue, by how much, and who is worth interrupting for.
 *
 * Everything in the first half of this file is pure: it takes people and dates
 * and returns numbers. The database only appears below the fold.
 */

export const BIRTHDAY_LOOKAHEAD_DAYS = 14;
/** A contact counts as recently added — and so gets the small boost — for 30 days. */
export const RECENTLY_ADDED_DAYS = 30;
/** No one is nudged more than once in this window, whatever their score. */
export const NUDGE_COOLDOWN_DAYS = 30;

export interface NudgeHistory {
  /** When this person was last shown in any digest. */
  lastShownOn: ISODate | null;
  /** Were they in the digest immediately before this one? */
  inPreviousDigest: boolean;
}

export const NO_HISTORY: NudgeHistory = { lastShownOn: null, inPreviousDigest: false };

/** The date the overdue clock runs from: last contact, or failing that, the day they were added. */
export function clockStart(person: Person): ISODate {
  return person.last_contacted_at ?? person.created_at.slice(0, 10);
}

/**
 * days_overdue = (today - last_contacted_at) - cadence_days
 * Null cadence means this person is never nudged.
 */
export function daysOverdue(person: Person, today: ISODate): number | null {
  if (person.cadence_days === null) return null;
  return daysBetween(clockStart(person), today) - person.cadence_days;
}

export function isSnoozed(person: Person, today: ISODate): boolean {
  return person.snoozed_until !== null && daysBetween(today, person.snoozed_until) > 0;
}

export function birthdayInDays(person: Person, today: ISODate): number | null {
  if (person.birthday_month === null || person.birthday_day === null) return null;
  return daysUntilBirthday(person.birthday_month, person.birthday_day, today);
}

/** A person surfaces when their birthday falls within the next fourteen days. */
export function birthdaySoon(person: Person, today: ISODate): boolean {
  const d = birthdayInDays(person, today);
  return d !== null && d >= 0 && d <= BIRTHDAY_LOOKAHEAD_DAYS;
}

export function recentlyAdded(person: Person, today: ISODate): boolean {
  return daysBetween(person.created_at.slice(0, 10), today) <= RECENTLY_ADDED_DAYS;
}

/** Overdue, not snoozed, and on a cadence. */
export function isOverdueEligible(person: Person, today: ISODate): boolean {
  const overdue = daysOverdue(person, today);
  return overdue !== null && overdue > 0 && !isSnoozed(person, today);
}

/**
 * score = days_overdue / cadence_days + 2·birthday_soon + 0.5·recently_added
 *
 * The first term normalises urgency, so thirty days past a thirty-day cadence
 * outranks thirty days past a year-long one.
 */
export function priorityScore(person: Person, today: ISODate): number {
  const overdue = daysOverdue(person, today);
  const cadence = person.cadence_days;
  const urgency = overdue !== null && cadence ? Math.max(0, overdue) / cadence : 0;
  return urgency + 2 * (birthdaySoon(person, today) ? 1 : 0) + 0.5 * (recentlyAdded(person, today) ? 1 : 0);
}

/**
 * Dampening. A person passes only if:
 *  - they weren't in the previous digest, and
 *  - they haven't been nudged in the last thirty days, whatever their score.
 *
 * A birthday inside the lookahead window is exempt from both. It has to be
 * exempt from both: consecutive digests are a week apart, so the thirty-day
 * cooldown would otherwise swallow the exemption the spec grants and a birthday
 * would silently go unsent.
 */
export function passesDampening(person: Person, history: NudgeHistory, today: ISODate): boolean {
  if (birthdaySoon(person, today)) return true;
  if (history.inPreviousDigest) return false;
  if (history.lastShownOn !== null && daysBetween(history.lastShownOn, today) < NUDGE_COOLDOWN_DAYS) return false;
  return true;
}

/** Dismissing a nudge snoozes that person for half their cadence. */
export function snoozeUntilForDismissal(person: Person, today: ISODate): ISODate {
  const half = Math.max(1, Math.round((person.cadence_days ?? 30) / 2));
  return addDays(today, half);
}

export interface ScoredPerson {
  person: Person;
  score: number;
  days_overdue: number | null;
  birthday_in_days: number | null;
}

export function score(person: Person, today: ISODate): ScoredPerson {
  return {
    person,
    score: priorityScore(person, today),
    days_overdue: daysOverdue(person, today),
    birthday_in_days: birthdayInDays(person, today),
  };
}

/** The overdue queue, highest priority first. Pure — feed it any list of people. */
export function rankOverdue(people: Person[], today: ISODate): ScoredPerson[] {
  return people
    .filter((p) => isOverdueEligible(p, today))
    .map((p) => score(p, today))
    .sort((a, b) => b.score - a.score || (b.days_overdue ?? 0) - (a.days_overdue ?? 0));
}

/** Everyone with a birthday inside the lookahead window, soonest first. */
export function rankBirthdays(people: Person[], today: ISODate): ScoredPerson[] {
  return people
    .filter((p) => birthdaySoon(p, today))
    .map((p) => score(p, today))
    .sort((a, b) => (a.birthday_in_days ?? 99) - (b.birthday_in_days ?? 99));
}

// ---------------------------------------------------------------------- store

export function nudgeHistoryFor(personIds: string[], previousDigestId: string | null): Map<string, NudgeHistory> {
  const out = new Map<string, NudgeHistory>();
  if (!personIds.length) return out;
  const placeholders = personIds.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT person_id, MAX(shown_on) AS last_shown,
              MAX(CASE WHEN digest_id IS ? THEN 1 ELSE 0 END) AS in_previous
       FROM nudges WHERE person_id IN (${placeholders})
       GROUP BY person_id`,
    )
    .all(previousDigestId, ...personIds) as { person_id: string; last_shown: string | null; in_previous: number }[];
  for (const r of rows) {
    out.set(r.person_id, { lastShownOn: r.last_shown, inPreviousDigest: r.in_previous === 1 });
  }
  return out;
}

export function recordNudge(
  personId: string,
  digestId: string | null,
  slot: "birthday" | "overdue" | "wildcard",
  scoreValue: number,
  shownOn: ISODate = todayISO(),
): string {
  const id = uuid();
  getDb()
    .prepare(`INSERT INTO nudges (id, person_id, digest_id, slot, score, shown_on) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, personId, digestId, slot, scoreValue, shownOn);
  return id;
}

export function recordNudgeOutcome(
  personId: string,
  digestId: string,
  outcome: "logged" | "snoozed" | "cadence_changed" | "not_now",
): void {
  getDb()
    .prepare(`UPDATE nudges SET outcome = ? WHERE person_id = ? AND digest_id = ?`)
    .run(outcome, personId, digestId);
}
