import { getDb, uuid } from "./db";
import { addDays, todayISO, type ISODate } from "./dates";
import { rankOverdue, type ScoredPerson } from "./nudge";
import type { Person, SavedView } from "./types";
import type { Filters } from "./filters";

export * from "./filters";

/**
 * Saved views and the person query behind them.
 *
 * Tags are what turn a list of names into something you can query before an
 * event. Any filter combination can be saved and named; in practice three or
 * four become the real home screen.
 */

export function queryPeople(f: Filters, today: ISODate = todayISO()): ScoredPerson[] {
  const where: string[] = [];
  const args: unknown[] = [];

  if (f.q) {
    where.push(`(p.name LIKE ? OR p.company LIKE ? OR p.notes LIKE ? OR p.how_we_met LIKE ? OR p.role LIKE ?)`);
    args.push(...Array(5).fill(`%${f.q}%`));
  }
  if (f.city) {
    where.push(`lower(p.city) = lower(?)`);
    args.push(f.city);
  }
  if (f.quietForDays) {
    where.push(`COALESCE(p.last_contacted_at, substr(p.created_at, 1, 10)) <= ?`);
    args.push(addDays(today, -f.quietForDays));
  }
  if (f.untagged) {
    where.push(`NOT EXISTS (SELECT 1 FROM people_tags pt WHERE pt.person_id = p.id)`);
  }
  if (f.orphansOnly) {
    where.push(`NOT EXISTS (SELECT 1 FROM introductions i WHERE i.person_id = p.id)`);
  }
  for (const tag of f.tags ?? []) {
    where.push(
      `EXISTS (SELECT 1 FROM people_tags pt JOIN tags t ON t.id = pt.tag_id
               WHERE pt.person_id = p.id AND lower(t.name) = lower(?))`,
    );
    args.push(tag);
  }

  const people = getDb()
    .prepare(
      `SELECT p.* FROM people p
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(...args) as Person[];

  if (f.overdueOnly) return rankOverdue(people, today);

  const scored = people.map((p) => {
    const [s] = rankOverdue([p], today);
    return s ?? scoreless(p, today);
  });

  return sortPeople(scored, f.sort ?? "name");
}

function scoreless(person: Person, today: ISODate): ScoredPerson {
  const [s] = rankOverdue([{ ...person, snoozed_until: null }], today);
  return s ?? { person, score: 0, days_overdue: null, birthday_in_days: null };
}

export function sortPeople(people: ScoredPerson[], sort: NonNullable<Filters["sort"]>): ScoredPerson[] {
  const copy = [...people];
  switch (sort) {
    case "overdue":
      return copy.sort((a, b) => (b.days_overdue ?? -Infinity) - (a.days_overdue ?? -Infinity));
    case "recent":
      return copy.sort((a, b) =>
        (b.person.last_contacted_at ?? "").localeCompare(a.person.last_contacted_at ?? ""));
    case "added":
      return copy.sort((a, b) => b.person.created_at.localeCompare(a.person.created_at));
    default:
      return copy.sort((a, b) => a.person.name.localeCompare(b.person.name));
  }
}

// ------------------------------------------------------------- saved views

export function saveView(name: string, filters: Filters): string {
  const id = uuid();
  getDb()
    .prepare(`INSERT INTO saved_views (id, name, filters, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, name.trim(), JSON.stringify(filters), new Date().toISOString());
  return id;
}

export function savedViews(): (SavedView & { parsed: Filters })[] {
  return (getDb().prepare(`SELECT * FROM saved_views ORDER BY created_at`).all() as SavedView[]).map((v) => ({
    ...v,
    parsed: JSON.parse(v.filters) as Filters,
  }));
}

export function deleteView(id: string): void {
  getDb().prepare(`DELETE FROM saved_views WHERE id = ?`).run(id);
}

