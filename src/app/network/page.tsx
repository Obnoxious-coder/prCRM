import Link from "next/link";
import { Empty, LastSeen, OverdueBadge, PersonLine, SectionHeading } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { connectors, introOpportunities, orphans, reciprocityDebts } from "@/lib/graph";
import { daysOverdue } from "@/lib/nudge";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const today = todayISO();
  const ranked = connectors(20);
  const cold = orphans();
  const debts = reciprocityDebts();
  const opportunities = introOpportunities();

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading
          title="Connectors"
          help="network"
          hint="How many people each contact brought you. Sort descending and you have your connectors."
        />
        {ranked.length === 0 ? (
          <Empty>
            No introductions recorded. Add “X introduced us” to a capture, or set it on a person&rsquo;s page.
          </Empty>
        ) : (
          <ul className="card px-4">
            {ranked.map((c) => (
              <PersonLine
                key={c.id}
                person={c}
                right={
                  <span>
                    {c.introduction_count} brought · {c.intros_given_back} returned
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>

      {debts.length > 0 && (
        <section>
          <SectionHeading
            title="Favours to return"
            hint="Networks run on returning favours. These people have introduced you to three or more, and you've introduced them to none."
          />
          <ul className="card px-4">
            {debts.map((d) => (
              <PersonLine key={d.person.id} person={d.person} right={<span>{d.given} introductions made</span>} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHeading
          title="Introductions you could make"
          hint="Two people sharing an industry tag with no edge between them."
        />
        {opportunities.length === 0 ? (
          <Empty>Nothing obvious — tag a few more people by industry.</Empty>
        ) : (
          <ul className="card px-4">
            {opportunities.map((o) => (
              <li
                key={`${o.a.id}-${o.b.id}`}
                className="border-line-soft flex flex-wrap items-baseline justify-between gap-2 border-b py-2.5 text-sm last:border-b-0"
              >
                <span>
                  <Link href={`/people/${o.a.id}`} className="hover:text-accent font-medium">{o.a.name}</Link>
                  <span className="text-ink-faint"> ↔ </span>
                  <Link href={`/people/${o.b.id}`} className="hover:text-accent font-medium">{o.b.name}</Link>
                </span>
                <span className="text-ink-faint text-xs">both {o.tag}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          title="Met cold"
          hint="No introduction edge. These lapse fastest and deserve a tighter cadence."
        />
        {cold.length === 0 ? (
          <Empty>Everyone came through someone.</Empty>
        ) : (
          <ul className="card px-4">
            {cold.map((p) => (
              <PersonLine
                key={p.id}
                person={p}
                right={
                  <span className="space-x-2">
                    <OverdueBadge days={daysOverdue(p, today)} />
                    <LastSeen date={p.last_contacted_at} today={today} />
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
