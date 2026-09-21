import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CadencePicker, DeleteInteraction, EditPerson, IntroducerPicker, QuickLog, SnoozeControls,
} from "@/components/PersonControls";
import { Empty, SectionHeading, TagPill } from "@/components/ui";
import { formatBirthday, formatDate, relativeLabel, todayISO } from "@/lib/dates";
import { introducedBy, introducedPeople, secondDegreeReach } from "@/lib/graph";
import { allPeople, getPerson, interactionsFor } from "@/lib/people";
import { birthdayInDays, daysOverdue, isSnoozed, priorityScore } from "@/lib/nudge";
import { tagsForPerson } from "@/lib/tags";
import { cadenceLabel } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const person = getPerson(id);
  if (!person) notFound();

  const today = todayISO();
  const tags = tagsForPerson(id);
  const interactions = interactionsFor(id);
  const introducer = introducedBy(id);
  const brought = introducedPeople(id);
  const reach = secondDegreeReach(id);
  const overdue = daysOverdue(person, today);
  const birthdayIn = birthdayInDays(person, today);
  const everyoneElse = allPeople()
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, name: p.name }));

  const meta = [person.role, person.company].filter(Boolean).join(" at ");

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-[2rem] leading-tight">{person.name}</h1>
            <p className="text-ink-soft mt-1 text-sm">
              {[meta, person.city].filter(Boolean).join(" · ") || "No details yet"}
            </p>
          </div>
          <QuickLog personId={id} />
        </div>

        {tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <TagPill key={t.id} tag={t} href={`/people?tag=${encodeURIComponent(t.name)}`} />
            ))}
          </div>
        )}

        <dl className="border-line-soft mt-5 grid gap-x-8 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2">
          <Row label="How we met">{person.how_we_met ?? <Faint>not recorded</Faint>}</Row>
          <Row label="Introduced by">
            {introducer ? (
              <Link href={`/people/${introducer.id}`} className="hover:text-accent underline-offset-2">
                {introducer.name}
              </Link>
            ) : (
              <Faint>met cold</Faint>
            )}
            <div className="mt-1">
              <IntroducerPicker personId={id} current={introducer?.id ?? null} candidates={everyoneElse} />
            </div>
          </Row>
          <Row label="Last contacted">
            {person.last_contacted_at ? (
              <>
                {relativeLabel(person.last_contacted_at, today)}{" "}
                <span className="text-ink-faint">({formatDate(person.last_contacted_at)})</span>
              </>
            ) : (
              <Faint>never logged — the clock runs from the day you added them</Faint>
            )}
          </Row>
          <Row label="Birthday">
            {person.birthday_month && person.birthday_day ? (
              <>
                {formatBirthday(person.birthday_month, person.birthday_day, person.birthday_year)}
                {birthdayIn !== null && birthdayIn <= 30 && (
                  <span className="text-birthday ml-2 text-xs">
                    {birthdayIn === 0 ? "today" : `in ${birthdayIn} days`}
                  </span>
                )}
              </>
            ) : (
              <Faint>unknown</Faint>
            )}
          </Row>
        </dl>
      </header>

      <section>
        <SectionHeading title="Cadence" hint={statusLine(overdue, person.cadence_days, isSnoozed(person, today))} />
        <CadencePicker person={person} />
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <SnoozeControls person={person} />
          <span className="text-ink-faint text-xs">
            {cadenceLabel(person.cadence_days)} · priority {priorityScore(person, today).toFixed(2)}
          </span>
        </div>
      </section>

      <section>
        <SectionHeading title="Notes" hint="The soft layer. This is what makes a follow-up personal." />
        {person.notes ? (
          <p className="card text-[0.9375rem] leading-relaxed whitespace-pre-wrap p-4">{person.notes}</p>
        ) : (
          <Empty>Nothing yet. Anything you add here shows up in the digest as an opening line.</Empty>
        )}
        <div className="mt-2">
          <EditPerson person={person} tags={tags} />
        </div>
      </section>

      <section>
        <SectionHeading title="History" hint={`${interactions.length} logged`} />
        {interactions.length === 0 ? (
          <Empty>No interactions yet. Tap Log above.</Empty>
        ) : (
          <ol className="card divide-line-soft divide-y px-4">
            {interactions.map((i) => (
              <li key={i.id} className="flex items-baseline justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="label-xs">{i.channel}</span>
                  <p className="mt-0.5 text-sm leading-relaxed">{i.summary ?? "—"}</p>
                </div>
                <div className="text-ink-faint flex shrink-0 items-baseline gap-2 text-xs">
                  <span title={formatDate(i.occurred_on)}>{relativeLabel(i.occurred_on, today)}</span>
                  <DeleteInteraction personId={id} interactionId={i.id} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <SectionHeading title="Brought you" hint="Introductions they've made." />
          {brought.length === 0 ? (
            <Empty>Nobody yet.</Empty>
          ) : (
            <ul className="card px-4 py-1">
              {brought.map((p) => (
                <li key={p.id} className="border-line-soft border-b py-2 text-sm last:border-b-0">
                  <Link href={`/people/${p.id}`} className="hover:text-accent">
                    {p.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading title="Could introduce you to" hint="Second-degree reach, by shared tags." />
          {reach.length === 0 ? (
            <Empty>No overlap yet — add a few tags.</Empty>
          ) : (
            <ul className="card px-4 py-1">
              {reach.map((r) => (
                <li
                  key={r.person.id}
                  className="border-line-soft flex items-baseline justify-between gap-3 border-b py-2 text-sm last:border-b-0"
                >
                  <Link href={`/people/${r.person.id}`} className="hover:text-accent">
                    {r.person.name}
                  </Link>
                  <span className="text-ink-faint text-xs">{r.shared_tags.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function statusLine(overdue: number | null, cadence: number | null, snoozed: boolean): string {
  if (cadence === null) return "No cadence — this person is never nudged.";
  if (snoozed) return "Snoozed. The cadence is intact; nudges are suppressed until it lapses.";
  if (overdue === null) return `Every ${cadence} days.`;
  if (overdue > 0) return `${overdue} days overdue on a ${cadence}-day cadence.`;
  return `Due in ${-overdue} days.`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-xs">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Faint({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-faint">{children}</span>;
}
