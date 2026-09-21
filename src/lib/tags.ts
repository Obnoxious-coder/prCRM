import { getDb, uuid } from "./db";
import type { Tag, TagKind } from "./types";
import type { ParsedTag } from "./parse/schema";

/**
 * The taxonomy is deliberately loose: the parser invents tags freely at capture
 * time and near-duplicates get merged later in the cleanup view. Forcing a fixed
 * vocabulary up front is the fastest way to stop using the system.
 */

export function normaliseTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ").replace(/^#/, "");
}

export function upsertTag(name: string, kind: TagKind | null): Tag {
  const db = getDb();
  const normalised = normaliseTagName(name);
  const existing = db.prepare(`SELECT * FROM tags WHERE name = ?`).get(normalised) as Tag | undefined;
  if (existing) {
    if (!existing.kind && kind) {
      db.prepare(`UPDATE tags SET kind = ? WHERE id = ?`).run(kind, existing.id);
      return { ...existing, kind };
    }
    return existing;
  }
  const tag: Tag = { id: uuid(), name: normalised, kind };
  db.prepare(`INSERT INTO tags (id, name, kind) VALUES (?, ?, ?)`).run(tag.id, tag.name, tag.kind);
  return tag;
}

export function setPersonTags(personId: string, tags: ParsedTag[]): void {
  const db = getDb();
  const link = db.prepare(`INSERT OR IGNORE INTO people_tags (person_id, tag_id) VALUES (?, ?)`);
  for (const t of tags) {
    if (!t.name.trim()) continue;
    link.run(personId, upsertTag(t.name, t.kind).id);
  }
}

export function replacePersonTags(personId: string, tags: ParsedTag[]): void {
  const db = getDb();
  db.prepare(`DELETE FROM people_tags WHERE person_id = ?`).run(personId);
  setPersonTags(personId, tags);
}

export function tagsForPerson(personId: string): Tag[] {
  return getDb()
    .prepare(
      `SELECT t.* FROM tags t
       JOIN people_tags pt ON pt.tag_id = t.id
       WHERE pt.person_id = ?
       ORDER BY t.kind IS NULL, t.kind, t.name`,
    )
    .all(personId) as Tag[];
}

export function tagsForPeople(personIds: string[]): Map<string, Tag[]> {
  const out = new Map<string, Tag[]>();
  if (!personIds.length) return out;
  const rows = getDb()
    .prepare(
      `SELECT pt.person_id, t.* FROM tags t
       JOIN people_tags pt ON pt.tag_id = t.id
       WHERE pt.person_id IN (${personIds.map(() => "?").join(",")})
       ORDER BY t.name`,
    )
    .all(...personIds) as (Tag & { person_id: string })[];
  for (const r of rows) {
    const list = out.get(r.person_id) ?? [];
    list.push({ id: r.id, name: r.name, kind: r.kind });
    out.set(r.person_id, list);
  }
  return out;
}

export interface TagWithCount extends Tag {
  people_count: number;
}

export function allTags(): TagWithCount[] {
  return getDb()
    .prepare(
      `SELECT t.*, COUNT(pt.person_id) AS people_count
       FROM tags t LEFT JOIN people_tags pt ON pt.tag_id = t.id
       GROUP BY t.id
       ORDER BY people_count DESC, t.name`,
    )
    .all() as TagWithCount[];
}

/** Moves every person onto `keepId`, then deletes the absorbed tag. */
export function mergeTags(keepId: string, mergeId: string): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO people_tags (person_id, tag_id)
       SELECT person_id, ? FROM people_tags WHERE tag_id = ?`,
    ).run(keepId, mergeId);
    db.prepare(`DELETE FROM tags WHERE id = ?`).run(mergeId);
  })();
}

export function renameTag(id: string, name: string, kind: TagKind | null): void {
  getDb().prepare(`UPDATE tags SET name = ?, kind = ? WHERE id = ?`).run(normaliseTagName(name), kind, id);
}

/**
 * Near-duplicate candidates for the cleanup view: same stem, plural/singular,
 * or a hyphen/space difference.
 */
export function duplicateTagPairs(tags: Tag[]): [Tag, Tag][] {
  const pairs: [Tag, Tag][] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      if (isNearDuplicate(tags[i].name, tags[j].name)) pairs.push([tags[i], tags[j]]);
    }
  }
  return pairs;
}

export function isNearDuplicate(a: string, b: string): boolean {
  const canon = (s: string) => s.replace(/[\s-]/g, "").replace(/(?:es|s)$/, "");
  if (a === b) return false;
  return canon(a) === canon(b);
}
