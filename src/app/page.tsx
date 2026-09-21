import Link from "next/link";
import { CaptureBox } from "@/components/CaptureBox";
import { Empty, LastSeen, OverdueBadge, PersonLine, SectionHeading, Stat } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { entryReason } from "@/lib/digest";
import { previewDigest } from "@/lib/digest-run";
import { connectors, orphans } from "@/lib/graph";
import { allPeople, countPeople } from "@/lib/people";
import { activeModel, activeProvider } from "@/lib/parse";
import { rankBirthdays, rankOverdue } from "@/lib/nudge";
import { queryPeople, savedViews, filtersToParams, describeFilters } from "@/lib/views";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const today = todayISO();
  const people = allPeople();
  const overdue = rankOverdue(people, today);
  const birthdays = rankBirthdays(people, today);
  const preview = previewDigest(today);
  const topConnectors = connectors(5);
  const cold = orphans();
  const views = savedViews();
  const provider = activeProvider();
  const model = activeModel();

  const providerLabel =
    provider === "rules"
      ? "rule-based parser"
      : `${provider}${model ? ` · ${model}` : ""}`;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="font-serif mb-1 text-[2rem] leading-tight">
          Who did you meet?
        </h1>
        <p className="text-ink-soft mb-4 text-sm">
          One sentence. Name is the only field that matters — everything else is a bonus.
        </p>
        <CaptureBox providerLabel={providerLabel} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={countPeople()} label="people" href="/people" />
        <Stat value={overdue.length} label="overdue" href="/people?overdue=1&sort=overdue" />
        <Stat value={birthdays.length} label="birthdays in 14 days" />
        <Stat value={cold.length} label="met cold" href="/people?orphans=1&sort=overdue" />
      </section>

      {views.length > 0 && (
        <section>
          <SectionHeading
            title="Saved views"
            hint="The three or four filters you actually use become the real home screen."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {views.map((v) => {
              const count = queryPeople(v.parsed, today).length;
              return (
                <Link
                  key={v.id}
                  href={`/people?${filtersToParams(v.parsed).toString()}`}
                  className="card hover:border-ink/25 px-4 py-3 transition-colors"
                >
                  <div className="font-medium">{v.name}</div>
                  <div className="text-ink-soft mt-0.5 text-xs">{describeFilters(v.parsed)}</div>
                  <div className="text-ink-faint mt-1.5 text-xs">{count} people</div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHeading
          title="This week's five"
          hint="What Monday's digest would say if it went out now."
          action={
            <Link href="/digest" className="text-accent text-sm hover:underline">
              Open digest →
            </Link>
          }
        />
        {preview.length === 0 ? (
          <Empty>Nobody is due. The dampening rules are doing their job.</Empty>
        ) : (
          <ol className="card divide-line-soft divide-y px-4">
            {preview.map((e) => (
              <li key={e.person.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/people/${e.person.id}`} className="hover:text-accent font-medium">
                    {e.person.name}
                  </Link>
                  <span
                    className={`text-xs ${
                      e.slot === "birthday"
                        ? "text-birthday"
                        : e.slot === "wildcard"
                          ? "text-wildcard"
                          : "text-ink-soft"
                    }`}
                  >
                    {entryReason(e)}
                  </span>
                </div>
                {e.soft_detail && (
                  <p className="text-ink-soft mt-1 text-[0.8125rem] leading-relaxed">{e.soft_detail}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <SectionHeading
            title="Your connectors"
            hint="People whose relationship compounds."
            action={
              <Link href="/network" className="text-accent text-sm hover:underline">
                Network →
              </Link>
            }
          />
          {topConnectors.length === 0 ? (
            <Empty>No introductions recorded yet.</Empty>
          ) : (
            <ul className="card px-4">
              {topConnectors.map((c) => (
                <PersonLine
                  key={c.id}
                  person={c}
                  right={
                    <span>
                      {c.introduction_count} intro{c.introduction_count === 1 ? "" : "s"}
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading title="Most overdue" hint="Normalised by cadence, not raw days." />
          {overdue.length === 0 ? (
            <Empty>Nobody is overdue.</Empty>
          ) : (
            <ul className="card px-4">
              {overdue.slice(0, 5).map((s) => (
                <PersonLine
                  key={s.person.id}
                  person={s.person}
                  right={
                    <span className="space-x-2">
                      <OverdueBadge days={s.days_overdue} />
                      <LastSeen date={s.person.last_contacted_at} today={today} />
                    </span>
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
