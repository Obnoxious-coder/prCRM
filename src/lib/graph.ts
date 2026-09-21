import { getDb, uuid } from "./db";
import type { ISODate } from "./dates";
import type { Person } from "./types";

/**
 * One field at capture time — who introduced us — builds a directed edge list.
 * That is all the graph you need.
 */

export interface Introduction {
  id: string;
  person_id: string;
  introduced_by_id: string;
  occurred_on: ISODate | null;
}

export function addIntroduction(personId: string, introducedById: string, occurredOn: ISODate | null): void {
  if (personId === introducedById) return;
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO introductions (id, person_id, introduced_by_id, occurred_on)
       VALUES (?, ?, ?, ?)`,
    )
    .run(uuid(), personId, introducedById, occurredOn);
}

export function removeIntroduction(personId: string, introducedById: string): void {
  getDb()
    .prepare(`DELETE FROM introductions WHERE person_id = ? AND introduced_by_id = ?`)
    .run(personId, introducedById);
}

/** Who introduced this person to you. */
export function introducedBy(personId: string): Person | null {
  return (
    (getDb()
      .prepare(
        `SELECT p.* FROM people p
         JOIN introductions i ON i.introduced_by_id = p.id
         WHERE i.person_id = ? LIMIT 1`,
      )
      .get(personId) as Person | undefined) ?? null
  );
}

/** Who this person brought you. */
export function introducedPeople(personId: string): Person[] {
  return getDb()
    .prepare(
      `SELECT p.* FROM people p
       JOIN introductions i ON i.person_id = p.id
       WHERE i.introduced_by_id = ?
       ORDER BY p.name COLLATE NOCASE`,
    )
    .all(personId) as Person[];
}

export interface Connector extends Person {
  introduction_count: number;
  intros_given_back: number;
}

/**
 * Connectors, ranked. These are the people whose relationship compounds, and a
 * ranked list of them on the home screen beats a graph visualisation that looks
 * impressive and gets used twice.
 */
export function connectors(limit = 10): Connector[] {
  return getDb()
    .prepare(
      `SELECT p.*,
              COUNT(i.id) AS introduction_count,
              (SELECT COUNT(*) FROM introductions o WHERE o.person_id = p.id) AS intros_given_back
       FROM people p
       JOIN introductions i ON i.introduced_by_id = p.id
       GROUP BY p.id
       HAVING introduction_count > 0
       ORDER BY introduction_count DESC, p.name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(limit) as Connector[];
}

/**
 * People met cold, with no introduction edge. These lapse fastest and deserve a
 * tighter cadence.
 */
export function orphans(): Person[] {
  return getDb()
    .prepare(
      `SELECT p.* FROM people p
       WHERE NOT EXISTS (SELECT 1 FROM introductions i WHERE i.person_id = p.id)
       ORDER BY COALESCE(p.last_contacted_at, p.created_at) ASC`,
    )
    .all() as Person[];
}

export interface Reach {
  person: Person;
  shared_tags: string[];
}

/**
 * Second-degree reach: who this contact could plausibly introduce you to, based
 * on shared tags. Excludes people they already introduced you to.
 */
export function secondDegreeReach(personId: string, limit = 8): Reach[] {
  const rows = getDb()
    .prepare(
      `SELECT other.*, GROUP_CONCAT(t.name, '|') AS shared
       FROM people other
       JOIN people_tags opt ON opt.person_id = other.id
       JOIN tags t          ON t.id = opt.tag_id
       JOIN people_tags mpt ON mpt.tag_id = t.id AND mpt.person_id = ?
       WHERE other.id != ?
         AND NOT EXISTS (
           SELECT 1 FROM introductions i
           WHERE i.person_id = other.id AND i.introduced_by_id = ?
         )
       GROUP BY other.id
       ORDER BY COUNT(t.id) DESC, other.name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(personId, personId, personId, limit) as (Person & { shared: string })[];
  return rows.map(({ shared, ...person }) => ({
    person: person as Person,
    shared_tags: shared.split("|"),
  }));
}

/**
 * Two people sharing an industry tag with no introduction edge between them —
 * an introduction you could make.
 */
export interface IntroOpportunity {
  a: Person;
  b: Person;
  tag: string;
}

export function introOpportunities(limit = 12): IntroOpportunity[] {
  const rows = getDb()
    .prepare(
      `SELECT a.id AS a_id, b.id AS b_id, t.name AS tag
       FROM people_tags pa
       JOIN tags t ON t.id = pa.tag_id AND t.kind = 'industry'
       JOIN people_tags pb ON pb.tag_id = t.id AND pb.person_id > pa.person_id
       JOIN people a ON a.id = pa.person_id
       JOIN people b ON b.id = pb.person_id
       WHERE NOT EXISTS (
         SELECT 1 FROM introductions i
         WHERE (i.person_id = a.id AND i.introduced_by_id = b.id)
            OR (i.person_id = b.id AND i.introduced_by_id = a.id)
       )
       GROUP BY a.id, b.id
       ORDER BY t.name, a.name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(limit) as { a_id: string; b_id: string; tag: string }[];
  const db = getDb();
  const get = db.prepare(`SELECT * FROM people WHERE id = ?`);
  return rows.map((r) => ({
    a: get.get(r.a_id) as Person,
    b: get.get(r.b_id) as Person,
    tag: r.tag,
  }));
}

export const RECIPROCITY_THRESHOLD = 3;

/**
 * Networks run on returning favours. If someone has introduced you to three or
 * more people and you have introduced them to none, the digest flags it.
 */
export function connectorReciprocityFlags(personIds: string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (!personIds.length) return out;
  const rows = getDb()
    .prepare(
      `SELECT p.id,
              (SELECT COUNT(*) FROM introductions i WHERE i.introduced_by_id = p.id) AS given,
              (SELECT COUNT(*) FROM introductions o WHERE o.person_id = p.id)        AS received
       FROM people p WHERE p.id IN (${personIds.map(() => "?").join(",")})`,
    )
    .all(...personIds) as { id: string; given: number; received: number }[];
  for (const r of rows) {
    if (r.given >= RECIPROCITY_THRESHOLD && r.received === 0) {
      out.set(r.id, `Introduced you to ${r.given} people. You've introduced them to none.`);
    }
  }
  return out;
}

export function reciprocityDebts(): { person: Person; given: number }[] {
  return getDb()
    .prepare(
      `SELECT p.*, COUNT(i.id) AS given
       FROM people p
       JOIN introductions i ON i.introduced_by_id = p.id
       WHERE NOT EXISTS (SELECT 1 FROM introductions o WHERE o.person_id = p.id)
       GROUP BY p.id
       HAVING given >= ?
       ORDER BY given DESC`,
    )
    .all(RECIPROCITY_THRESHOLD)
    .map((row) => {
      const { given, ...person } = row as Person & { given: number };
      return { person: person as Person, given };
    });
}
