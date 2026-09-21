import { getDb, uuid } from "./db";
import { todayISO, type ISODate } from "./dates";
import { replacePersonTags, setPersonTags } from "./tags";
import { DEFAULT_CADENCE_DAYS, type Channel, type Interaction, type Person } from "./types";
import type { ParsedPerson } from "./parse/schema";

export function getPerson(id: string): Person | null {
  return (getDb().prepare(`SELECT * FROM people WHERE id = ?`).get(id) as Person | undefined) ?? null;
}

export function allPeople(): Person[] {
  return getDb().prepare(`SELECT * FROM people ORDER BY name COLLATE NOCASE`).all() as Person[];
}

export function countPeople(): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
}

/**
 * Ambiguous names — two people called Rahul — are resolved by showing both
 * candidates with a distinguishing detail, never by merging silently.
 */
export function nameCandidates(name: string): Person[] {
  const trimmed = name.trim();
  if (!trimmed) return [];
  return getDb()
    .prepare(
      `SELECT * FROM people
       WHERE lower(name) = lower(?) OR lower(name) LIKE lower(?) OR lower(?) LIKE lower(name) || '%'
       ORDER BY name COLLATE NOCASE`,
    )
    .all(trimmed, `${trimmed}%`, trimmed) as Person[];
}

export function distinguishingDetail(p: Person): string {
  return [p.company, p.city, p.role, p.how_we_met].find((v) => v && v.trim()) ?? "no other details";
}

export interface SavePersonInput extends ParsedPerson {
  cadence_days?: number | null;
}

/** Creates a person from a parse. Name alone is enough. */
export function createPerson(parsed: SavePersonInput, at: ISODate = todayISO()): string {
  const db = getDb();
  const id = uuid();
  db.prepare(
    `INSERT INTO people (id, name, how_we_met, company, role, city,
       birthday_month, birthday_day, birthday_year, cadence_days, notes,
       last_contacted_at, snoozed_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
  ).run(
    id,
    parsed.name.trim() || "Unnamed",
    nullify(parsed.how_we_met),
    nullify(parsed.company),
    nullify(parsed.role),
    nullify(parsed.city),
    parsed.birthday?.month ?? null,
    parsed.birthday?.day ?? null,
    parsed.birthday?.year ?? null,
    parsed.cadence_days === undefined ? DEFAULT_CADENCE_DAYS : parsed.cadence_days,
    nullify(parsed.notes),
    `${at}T00:00:00.000Z`,
  );
  setPersonTags(id, parsed.tags);
  return id;
}

/**
 * Merging a fresh parse into an existing record. New facts fill empty fields;
 * an existing value is never overwritten by the parse, and notes accumulate —
 * the soft layer is additive by nature.
 */
export function mergeIntoPerson(id: string, parsed: ParsedPerson): void {
  const person = getPerson(id);
  if (!person) throw new Error(`No person ${id}`);
  const db = getDb();

  db.prepare(
    `UPDATE people SET
       how_we_met = COALESCE(how_we_met, ?),
       company    = COALESCE(company, ?),
       role       = COALESCE(role, ?),
       city       = COALESCE(city, ?),
       birthday_month = COALESCE(birthday_month, ?),
       birthday_day   = COALESCE(birthday_day, ?),
       birthday_year  = COALESCE(birthday_year, ?),
       notes = CASE
         WHEN ? IS NULL THEN notes
         WHEN notes IS NULL OR notes = '' THEN ?
         WHEN instr(notes, ?) > 0 THEN notes
         ELSE notes || char(10) || ?
       END
     WHERE id = ?`,
  ).run(
    nullify(parsed.how_we_met),
    nullify(parsed.company),
    nullify(parsed.role),
    nullify(parsed.city),
    parsed.birthday?.month ?? null,
    parsed.birthday?.day ?? null,
    parsed.birthday?.year ?? null,
    nullify(parsed.notes),
    nullify(parsed.notes),
    parsed.notes ?? "",
    nullify(parsed.notes),
    id,
  );
  setPersonTags(id, parsed.tags);
}

export function updatePerson(id: string, fields: Partial<Person>): void {
  const allowed: (keyof Person)[] = [
    "name", "how_we_met", "company", "role", "city",
    "birthday_month", "birthday_day", "birthday_year",
    "cadence_days", "notes", "snoozed_until",
  ];
  const entries = allowed.filter((k) => k in fields);
  if (!entries.length) return;
  getDb()
    .prepare(`UPDATE people SET ${entries.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...entries.map((k) => fields[k] ?? null), id);
}

export function setCadence(id: string, days: number | null): void {
  getDb().prepare(`UPDATE people SET cadence_days = ? WHERE id = ?`).run(days, id);
}

/** Snoozing suppresses nudges without deleting the cadence. */
export function snoozePerson(id: string, until: ISODate): void {
  getDb().prepare(`UPDATE people SET snoozed_until = ? WHERE id = ?`).run(until, id);
}

export function deletePerson(id: string): void {
  getDb().prepare(`DELETE FROM people WHERE id = ?`).run(id);
}

export function setPersonTagsFromNames(id: string, names: string[]): void {
  replacePersonTags(id, names.map((name) => ({ name, kind: null })));
}

// ---------------------------------------------------------------- interactions

export function logInteraction(
  personId: string,
  input: { occurred_on: ISODate; channel: Channel; summary: string | null },
): string {
  const db = getDb();
  const id = uuid();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO interactions (id, person_id, occurred_on, channel, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, personId, input.occurred_on, input.channel, nullify(input.summary), new Date().toISOString());
    recomputeLastContacted(personId);
    // Logging contact resets the overdue clock, so any snooze is moot.
    db.prepare(`UPDATE people SET snoozed_until = NULL WHERE id = ?`).run(personId);
  })();
  return id;
}

/** `last_contacted_at` is denormalised from interactions for fast queries. */
export function recomputeLastContacted(personId: string): void {
  getDb()
    .prepare(
      `UPDATE people SET last_contacted_at =
         (SELECT MAX(occurred_on) FROM interactions WHERE person_id = ?)
       WHERE id = ?`,
    )
    .run(personId, personId);
}

export function interactionsFor(personId: string): Interaction[] {
  return getDb()
    .prepare(`SELECT * FROM interactions WHERE person_id = ? ORDER BY occurred_on DESC, created_at DESC`)
    .all(personId) as Interaction[];
}

export function lastInteraction(personId: string): Interaction | null {
  return (
    (getDb()
      .prepare(`SELECT * FROM interactions WHERE person_id = ? ORDER BY occurred_on DESC, created_at DESC LIMIT 1`)
      .get(personId) as Interaction | undefined) ?? null
  );
}

export function lastInteractions(personIds: string[]): Map<string, Interaction> {
  const out = new Map<string, Interaction>();
  if (!personIds.length) return out;
  const rows = getDb()
    .prepare(
      `SELECT i.* FROM interactions i
       JOIN (SELECT person_id, MAX(occurred_on) AS m FROM interactions
             WHERE person_id IN (${personIds.map(() => "?").join(",")})
             GROUP BY person_id) x
         ON x.person_id = i.person_id AND x.m = i.occurred_on
       GROUP BY i.person_id`,
    )
    .all(...personIds) as Interaction[];
  for (const r of rows) out.set(r.person_id, r);
  return out;
}

export function deleteInteraction(id: string): void {
  const db = getDb();
  const row = db.prepare(`SELECT person_id FROM interactions WHERE id = ?`).get(id) as { person_id: string } | undefined;
  if (!row) return;
  db.prepare(`DELETE FROM interactions WHERE id = ?`).run(id);
  recomputeLastContacted(row.person_id);
}

function nullify(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}
