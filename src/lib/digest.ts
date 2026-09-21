import { getDb, uuid } from "./db";
import { addDays, daysBetween, formatDate, relativeLabel, todayISO, type ISODate } from "./dates";
import { lastInteractions } from "./people";
import {
  NO_HISTORY, passesDampening, rankBirthdays, rankOverdue,
  recordNudge, score, type ScoredPerson,
} from "./nudge";
import { connectorReciprocityFlags } from "./graph";
import type { Interaction, Person } from "./types";

/**
 * One email every Monday with five people. One decision point per week beats
 * fifteen interruptions.
 */

export const DIGEST_SIZE = 5;
export const BIRTHDAY_SLOTS = 2;
export const OVERDUE_SLOTS = 2;
/** The wildcard resurfaces the long tail, which cadence-based logic buries. */
export const WILDCARD_STALE_DAYS = 365;

export type Slot = "birthday" | "overdue" | "wildcard";

export interface DigestEntry {
  person: Person;
  slot: Slot;
  score: number;
  days_overdue: number | null;
  birthday_in_days: number | null;
  last_interaction: Interaction | null;
  soft_detail: string | null;
  reciprocity_flag: string | null;
}

export interface Digest {
  id: string;
  sent_on: ISODate;
  person_ids: string;
  html: string;
  opened_at: string | null;
  delivery: string;
  created_at: string;
}

/**
 * Builds the week's five. Slots 1–2 birthdays, 3–4 the highest-scoring overdue,
 * 5 a wildcard. When there are no birthdays, overdue contacts fill those slots.
 */
export function composeDigest(
  people: Person[],
  today: ISODate,
  history: Map<string, { lastShownOn: ISODate | null; inPreviousDigest: boolean }>,
  pickRandom: (n: number) => number = (n) => Math.floor(Math.random() * n),
): DigestEntry[] {
  const taken = new Set<string>();
  const chosen: { scored: ScoredPerson; slot: Slot }[] = [];
  const allowed = (p: Person) =>
    !taken.has(p.id) && passesDampening(p, history.get(p.id) ?? NO_HISTORY, today);

  for (const s of rankBirthdays(people, today)) {
    if (chosen.filter((c) => c.slot === "birthday").length >= BIRTHDAY_SLOTS) break;
    if (!allowed(s.person)) continue;
    chosen.push({ scored: s, slot: "birthday" });
    taken.add(s.person.id);
  }

  // Empty birthday slots fall through to overdue.
  const overdueSlots = OVERDUE_SLOTS + (BIRTHDAY_SLOTS - chosen.length);
  for (const s of rankOverdue(people, today)) {
    if (chosen.filter((c) => c.slot === "overdue").length >= overdueSlots) break;
    if (!allowed(s.person)) continue;
    chosen.push({ scored: s, slot: "overdue" });
    taken.add(s.person.id);
  }

  const wildcards = people.filter(
    (p) =>
      allowed(p) &&
      daysBetween(p.last_contacted_at ?? p.created_at.slice(0, 10), today) > WILDCARD_STALE_DAYS,
  );
  if (wildcards.length) {
    const pick = wildcards[pickRandom(wildcards.length) % wildcards.length];
    chosen.push({ scored: score(pick, today), slot: "wildcard" });
    taken.add(pick.id);
  }

  // An empty wildcard slot — nobody is a year stale — falls back to overdue,
  // the same way empty birthday slots do. The dampening caps still hold:
  // they are absolute ("regardless of score"), so a week with fewer than five
  // eligible people is simply a short digest.
  if (chosen.length < DIGEST_SIZE) {
    for (const s of rankOverdue(people, today)) {
      if (chosen.length >= DIGEST_SIZE) break;
      if (!allowed(s.person)) continue;
      chosen.push({ scored: s, slot: "overdue" });
      taken.add(s.person.id);
    }
  }

  return hydrate(chosen.slice(0, DIGEST_SIZE));
}

function hydrate(chosen: { scored: ScoredPerson; slot: Slot }[]): DigestEntry[] {
  const ids = chosen.map((c) => c.scored.person.id);
  const last = ids.length ? lastInteractions(ids) : new Map<string, Interaction>();
  const flags = ids.length ? connectorReciprocityFlags(ids) : new Map<string, string>();
  return chosen.map(({ scored, slot }) => ({
    person: scored.person,
    slot,
    score: scored.score,
    days_overdue: scored.days_overdue,
    birthday_in_days: scored.birthday_in_days,
    last_interaction: last.get(scored.person.id) ?? null,
    soft_detail: softDetail(scored.person.notes),
    reciprocity_flag: flags.get(scored.person.id) ?? null,
  }));
}

/**
 * One soft detail pulled from notes. That detail is the whole point — it gives
 * you an opening line instead of a blank message box.
 */
export function softDetail(notes: string | null): string | null {
  if (!notes?.trim()) return null;
  const parts = notes
    .split(/\n|;|(?<=[.!?])\s+/)
    .map((s) => s.trim().replace(/^[-–—•]\s*/, ""))
    .filter(Boolean);
  if (!parts.length) return null;
  const SOFT = /\b(cat|dog|kid|kids|son|daughter|wife|husband|spouse|partner|married|grew up|from|loves|likes|into|plays|climbs|runs|cooks|bakes|reads|collects|studied|obsessed)\b/i;
  return parts.find((p) => SOFT.test(p)) ?? parts[0];
}

export function entryReason(entry: DigestEntry): string {
  if (entry.slot === "birthday") {
    const d = entry.birthday_in_days ?? 0;
    return d === 0 ? "Birthday today" : d === 1 ? "Birthday tomorrow" : `Birthday in ${d} days`;
  }
  if (entry.slot === "wildcard") return "Wildcard — over a year since you spoke";
  return `${entry.days_overdue} days past a ${entry.person.cadence_days}-day cadence`;
}

// -------------------------------------------------------------------- store

export function lastDigest(): Digest | null {
  return (
    (getDb().prepare(`SELECT * FROM digests ORDER BY sent_on DESC, created_at DESC LIMIT 1`).get() as
      | Digest
      | undefined) ?? null
  );
}

export function getDigest(id: string): Digest | null {
  return (getDb().prepare(`SELECT * FROM digests WHERE id = ?`).get(id) as Digest | undefined) ?? null;
}

export function recentDigests(limit = 12): Digest[] {
  return getDb()
    .prepare(`SELECT * FROM digests ORDER BY sent_on DESC, created_at DESC LIMIT ?`)
    .all(limit) as Digest[];
}

export function digestEntries(digest: Digest): DigestEntry[] {
  const ids = JSON.parse(digest.person_ids) as string[];
  if (!ids.length) return [];
  const db = getDb();
  const people = db
    .prepare(`SELECT * FROM people WHERE id IN (${ids.map(() => "?").join(",")})`)
    .all(...ids) as Person[];
  const slots = db
    .prepare(`SELECT person_id, slot, score FROM nudges WHERE digest_id = ?`)
    .all(digest.id) as { person_id: string; slot: Slot; score: number }[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const today = todayISO();
  const chosen = ids
    .map((id) => {
      const person = byId.get(id);
      if (!person) return null;
      const slot = slots.find((s) => s.person_id === id)?.slot ?? "overdue";
      return { scored: score(person, today), slot };
    })
    .filter((x): x is { scored: ScoredPerson; slot: Slot } => x !== null);
  return hydrate(chosen);
}

export function markDigestOpened(id: string): void {
  getDb().prepare(`UPDATE digests SET opened_at = COALESCE(opened_at, ?) WHERE id = ?`).run(new Date().toISOString(), id);
}

export interface Settings {
  id: number;
  digest_frequency: "weekly" | "fortnightly";
  digest_email: string | null;
  timezone: string;
}

export function getSettings(): Settings {
  return getDb().prepare(`SELECT * FROM settings WHERE id = 1`).get() as Settings;
}

export function updateSettings(fields: Partial<Omit<Settings, "id">>): void {
  const keys = Object.keys(fields) as (keyof Omit<Settings, "id">)[];
  if (!keys.length) return;
  getDb()
    .prepare(`UPDATE settings SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = 1`)
    .run(...keys.map((k) => fields[k] ?? null));
}

/**
 * If three consecutive digests go unopened, drop to fortnightly automatically
 * rather than continuing to shout into a void.
 */
export function applyOpenRateBackoff(): "weekly" | "fortnightly" {
  const recent = getDb()
    .prepare(`SELECT opened_at FROM digests ORDER BY sent_on DESC, created_at DESC LIMIT 3`)
    .all() as { opened_at: string | null }[];
  const settings = getSettings();
  if (recent.length === 3 && recent.every((d) => d.opened_at === null) && settings.digest_frequency === "weekly") {
    updateSettings({ digest_frequency: "fortnightly" });
    return "fortnightly";
  }
  return settings.digest_frequency;
}

/** Is a digest due today under the current frequency? Mondays only. */
export function digestDueOn(today: ISODate, last: Digest | null, frequency: "weekly" | "fortnightly"): boolean {
  const isMonday = new Date(`${today}T00:00:00.000Z`).getUTCDay() === 1;
  if (!isMonday) return false;
  if (!last) return true;
  const gap = daysBetween(last.sent_on, today);
  return gap >= (frequency === "weekly" ? 7 : 14);
}

export function nextDigestDate(today: ISODate, frequency: "weekly" | "fortnightly", last: Digest | null): ISODate {
  const daysToMonday = (8 - new Date(`${today}T00:00:00.000Z`).getUTCDay()) % 7 || 7;
  let candidate = addDays(today, daysToMonday);
  if (last && daysBetween(last.sent_on, candidate) < (frequency === "weekly" ? 7 : 14)) {
    candidate = addDays(candidate, 7);
  }
  return candidate;
}

export function saveDigest(
  id: string,
  sentOn: ISODate,
  entries: DigestEntry[],
  html: string,
  delivery: "resend" | "file",
): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO digests (id, sent_on, person_ids, html, opened_at, delivery, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, sentOn, JSON.stringify(entries.map((e) => e.person.id)), html, delivery, new Date().toISOString());
    for (const e of entries) recordNudge(e.person.id, id, e.slot, e.score, sentOn);
  })();
}

export function newDigestId(): string {
  return uuid();
}

export { formatDate, relativeLabel };
