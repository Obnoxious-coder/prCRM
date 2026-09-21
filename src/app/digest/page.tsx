import Link from "next/link";
import { EntryActions, SendDigest } from "@/components/DigestControls";
import { Empty, SectionHeading } from "@/components/ui";
import { formatDate, relativeLabel, todayISO } from "@/lib/dates";
import {
  digestEntries, entryReason, getSettings, lastDigest, nextDigestDate, recentDigests,
  type DigestEntry,
} from "@/lib/digest";
import { previewDigest } from "@/lib/digest-run";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  const today = todayISO();
  const settings = getSettings();
  const latest = lastDigest();
  const entries = latest ? digestEntries(latest) : [];
  const preview = previewDigest(today);

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading
          title="Weekly digest"
          hint={`One ${settings.digest_frequency === "weekly" ? "email every Monday" : "email every other Monday"} with five people. Next: ${formatDate(nextDigestDate(today, settings.digest_frequency, latest))}.`}
          action={<SendDigest label={latest?.sent_on === today ? "Rebuild now" : "Send now"} />}
        />
        {!settings.digest_email && (
          <p className="text-ink-soft card mb-4 p-3 text-xs leading-relaxed">
            No delivery address set, so digests are written to <code>.digests/</code> and shown here.
            Add an address and a <code>RESEND_API_KEY</code> in{" "}
            <Link href="/settings" className="text-accent underline">
              settings
            </Link>{" "}
            to have them emailed.
          </p>
        )}
      </section>

      {latest && (
        <section>
          <SectionHeading
            title={`Sent ${formatDate(latest.sent_on)}`}
            hint={`${relativeLabel(latest.sent_on, today)} · ${latest.delivery === "resend" ? "emailed" : "written to disk"} · ${latest.opened_at ? "opened" : "not opened yet"}`}
          />
          {entries.length === 0 ? (
            <Empty>Every entry in this digest has been actioned.</Empty>
          ) : (
            <ol className="space-y-3">
              {entries.map((e, i) => (
                <EntryCard key={e.person.id} entry={e} index={i + 1} digestId={latest.id} today={today} />
              ))}
            </ol>
          )}
        </section>
      )}

      <section>
        <SectionHeading
          title={latest ? "Next digest, as it stands" : "Your first digest"}
          hint="Recomputed live. Dampening rules are already applied."
        />
        {preview.length === 0 ? (
          <Empty>Nobody qualifies right now.</Empty>
        ) : (
          <ol className="space-y-3">
            {preview.map((e, i) => (
              <EntryCard key={e.person.id} entry={e} index={i + 1} digestId={null} today={today} />
            ))}
          </ol>
        )}
      </section>

      <section>
        <SectionHeading title="History" />
        {recentDigests().length === 0 ? (
          <Empty>No digests sent yet.</Empty>
        ) : (
          <ul className="card px-4">
            {recentDigests().map((d) => (
              <li
                key={d.id}
                className="border-line-soft flex items-baseline justify-between gap-3 border-b py-2.5 text-sm last:border-b-0"
              >
                <span>{formatDate(d.sent_on)}</span>
                <span className="text-ink-faint text-xs">
                  {(JSON.parse(d.person_ids) as string[]).length} people ·{" "}
                  {d.delivery === "resend" ? "emailed" : "on disk"} ·{" "}
                  {d.opened_at ? "opened" : "unopened"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function EntryCard({
  entry,
  index,
  digestId,
  today,
}: {
  entry: DigestEntry;
  index: number;
  digestId: string | null;
  today: string;
}) {
  const meta = [entry.person.role, entry.person.company, entry.person.city].filter(Boolean).join(" · ");
  const colour =
    entry.slot === "birthday" ? "text-birthday" : entry.slot === "wildcard" ? "text-wildcard" : "text-ink-soft";

  return (
    <li className="card p-4">
      <div className={`text-[0.6875rem] font-semibold tracking-[0.09em] uppercase ${colour}`}>
        {index}. {entryReason(entry)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/people/${entry.person.id}`} className="font-serif hover:text-accent text-xl">
          {entry.person.name}
        </Link>
        {meta && <span className="text-ink-soft text-[0.8125rem]">{meta}</span>}
      </div>
      {entry.person.how_we_met && (
        <p className="text-ink-soft mt-2 text-[0.8125rem]">Met: {entry.person.how_we_met}</p>
      )}
      <p className="text-ink-soft mt-0.5 text-[0.8125rem]">
        Last:{" "}
        {entry.last_interaction
          ? `${entry.last_interaction.summary ?? entry.last_interaction.channel} — ${relativeLabel(entry.last_interaction.occurred_on, today)}`
          : "nothing logged"}
      </p>
      {entry.soft_detail && (
        <p className="bg-accent-soft/60 mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed">
          {entry.soft_detail}
        </p>
      )}
      {entry.reciprocity_flag && (
        <p className="text-birthday mt-2 text-xs">{entry.reciprocity_flag}</p>
      )}
      {digestId ? (
        <EntryActions digestId={digestId} personId={entry.person.id} cadenceDays={entry.person.cadence_days} />
      ) : (
        <p className="text-ink-faint mt-3 text-xs">Actions appear once the digest is sent.</p>
      )}
    </li>
  );
}
