/**
 * Filter shapes and URL serialisation. Pure — no database — so client
 * components can import it without pulling better-sqlite3 into the browser
 * bundle. The queries themselves live in `views.ts`.
 */

export interface Filters {
  q?: string;
  tags?: string[];            // tag names, ANDed
  city?: string;
  /** Not contacted in the last N days. */
  quietForDays?: number;
  overdueOnly?: boolean;
  untagged?: boolean;
  orphansOnly?: boolean;      // met cold, no introduction edge
  sort?: "name" | "overdue" | "recent" | "added";
}

export function parseFilters(params: URLSearchParams): Filters {
  const tags = params.getAll("tag").filter(Boolean);
  const quiet = params.get("quiet");
  return {
    q: params.get("q") ?? undefined,
    tags: tags.length ? tags : undefined,
    city: params.get("city") ?? undefined,
    quietForDays: quiet ? Number(quiet) : undefined,
    overdueOnly: params.get("overdue") === "1" || undefined,
    untagged: params.get("untagged") === "1" || undefined,
    orphansOnly: params.get("orphans") === "1" || undefined,
    sort: (params.get("sort") as Filters["sort"]) ?? undefined,
  };
}

export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  for (const t of f.tags ?? []) p.append("tag", t);
  if (f.city) p.set("city", f.city);
  if (f.quietForDays) p.set("quiet", String(f.quietForDays));
  if (f.overdueOnly) p.set("overdue", "1");
  if (f.untagged) p.set("untagged", "1");
  if (f.orphansOnly) p.set("orphans", "1");
  if (f.sort) p.set("sort", f.sort);
  return p;
}

export function isEmptyFilters(f: Filters): boolean {
  return filtersToParams(f).toString() === "";
}

export function describeFilters(f: Filters): string {
  const bits: string[] = [];
  if (f.q) bits.push(`matching “${f.q}”`);
  if (f.tags?.length) bits.push(f.tags.join(" + "));
  if (f.city) bits.push(`in ${f.city}`);
  if (f.quietForDays) bits.push(`quiet for ${humanDays(f.quietForDays)}`);
  if (f.overdueOnly) bits.push("overdue");
  if (f.untagged) bits.push("untagged");
  if (f.orphansOnly) bits.push("met cold");
  return bits.length ? bits.join(", ") : "everyone";
}

function humanDays(days: number): string {
  if (days % 365 === 0) return `${days / 365} year${days === 365 ? "" : "s"}`;
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}
