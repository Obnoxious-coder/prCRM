import { Suspense } from "react";
import { FilterBar } from "@/components/FilterBar";
import { Empty, LastSeen, OverdueBadge, PersonLine, SectionHeading } from "@/components/ui";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { allTags, tagsForPeople } from "@/lib/tags";
import { describeFilters, parseFilters, queryPeople, savedViews } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    for (const item of Array.isArray(v) ? v : v === undefined ? [] : [v]) params.append(k, item);
  }

  const today = todayISO();
  const filters = parseFilters(params);
  const results = queryPeople(filters, today);
  const tagMap = tagsForPeople(results.map((r) => r.person.id));

  const cities = (
    getDb().prepare(`SELECT DISTINCT city FROM people WHERE city IS NOT NULL ORDER BY city`).all() as {
      city: string;
    }[]
  ).map((r) => r.city);

  return (
    <div>
      <SectionHeading
        title="People"
        hint={`${results.length} ${results.length === 1 ? "person" : "people"} — ${describeFilters(filters)}`}
      />
      <Suspense fallback={null}>
        <FilterBar
          cities={cities}
          tags={allTags().slice(0, 18).map((t) => t.name)}
          views={savedViews().map((v) => ({ id: v.id, name: v.name }))}
        />
      </Suspense>

      {results.length === 0 ? (
        <Empty>Nobody matches. Loosen a filter, or capture someone new from the home screen.</Empty>
      ) : (
        <ul className="card px-4">
          {results.map((s) => (
            <PersonLine
              key={s.person.id}
              person={s.person}
              tags={tagMap.get(s.person.id) ?? []}
              right={
                <span className="space-y-0.5">
                  <span className="block">
                    <LastSeen date={s.person.last_contacted_at} today={today} />
                  </span>
                  <span className="block">
                    <OverdueBadge days={s.days_overdue} />
                  </span>
                </span>
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}
