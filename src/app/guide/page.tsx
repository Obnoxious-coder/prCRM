import Link from "next/link";

/**
 * The walkthrough. Every section answers the same two questions in order:
 * what does this do, and why is it built that way — because most of the
 * design decisions here only make sense once you know what they're avoiding.
 */

export const metadata = { title: "How this works · Personal CRM" };

interface Section {
  id: string;
  title: string;
  what: string;
  how: string[];
  why?: string;
}

const SECTIONS: Section[] = [
  {
    id: "capture",
    title: "Capture",
    what:
      "One text box on the home screen. Write a sentence the way you'd say it out loud, and it becomes structured fields you can correct before saving.",
    how: [
      "Type something like “met Priya at the Bangalore fintech meetup, she runs growth at a lending startup, has a cat called Mango, Arjun introduced us”.",
      "Press ⌘↵ (or click Parse). A card appears with the name, role, company, city, how you met, notes and tags filled in.",
      "Every field on that card is editable in place. Fix anything wrong, then click Save.",
      "Paste several lines at once — a badge dump from a conference — and each line becomes its own record.",
      "If the name matches someone you already know, you'll be offered both people with a detail to tell them apart, plus a Create new option. Nothing merges behind your back.",
    ],
    why:
      "Name is the only required field. A record with nothing but a name is valid, because the alternative is that you don't write anything down at all.",
  },
  {
    id: "notes",
    title: "Notes, and why they matter more than the job title",
    what:
      "The free-text notes hold the soft layer: spouse, kids, pets, hobbies, where they grew up, what they were worried about last time.",
    how: [
      "Anything the parser can't fit into a structured field lands here.",
      "Add more any time from the person's page via Edit details. Notes accumulate rather than overwrite.",
      "One line from here is pulled into every digest entry.",
    ],
    why:
      "That one detail is the difference between a message you can actually write and a blank box you close again. “How's Mango?” beats “just checking in”.",
  },
  {
    id: "log",
    title: "Quick-log",
    what: "Recording that you spoke to someone, in one sentence, from their page.",
    how: [
      "Open a person and click Log.",
      "Type what happened. The date and the channel (met, call, message, email) are read from your sentence — “called her last Tuesday” logs a call on the right day.",
      "Override either with the dropdown and date picker if the guess is wrong.",
      "Saving resets their overdue clock and cancels any snooze.",
    ],
  },
  {
    id: "cadence",
    title: "Cadence",
    what:
      "How often you want to be in touch with someone. It's the number the nudges are measured against.",
    how: [
      "Five tiers: Close (30 days), Active (90), Loose (180), Dormant (365), and None.",
      "New contacts start at Active. Change it in one tap from the person's page.",
      "None means this person is never nudged — useful for people you'll see anyway.",
      "Someone is overdue when the days since you last spoke exceed their cadence.",
      "Never logged an interaction? The clock runs from the day you added them, so new contacts still enter the cycle.",
    ],
    why:
      "One number per person is the smallest thing that can express “I want to keep this warm” without asking you to schedule anything.",
  },
  {
    id: "digest",
    title: "The weekly digest",
    what: "One list of five people, once a week, instead of notifications all week.",
    how: [
      "Two slots go to anyone with a birthday in the next fortnight, two to the most overdue, and one wildcard to someone you haven't spoken to in over a year.",
      "No birthdays that week? Overdue people fill those slots instead.",
      "Each entry shows how you met, your last interaction, and one soft detail from their notes.",
      "Four actions per entry: Log it (records contact and resets the clock), Snooze (pushes them out by half their cadence), Change cadence (when the tier was wrong), and Not now (drops them from this week only).",
      "See it at /digest — the next one is previewed live, recomputed as things change.",
    ],
    why:
      "One decision point per week beats fifteen interruptions. The wildcard exists because cadence-based logic quietly buries the long tail, which is exactly where the people you've forgotten live.",
  },
  {
    id: "nudges",
    title: "How it picks the five",
    what:
      "Everyone overdue gets a score, and the top few surface. Urgency is measured relative to the cadence, not in raw days.",
    how: [
      "Someone thirty days past a thirty-day cadence outranks someone thirty days past a year-long one — being a month late on a close friend matters more.",
      "A birthday inside the next fortnight is a strong boost; they're time-sensitive and easy to act on.",
      "A recently added contact gets a small boost, because the first follow-up after meeting matters most.",
      "Nobody appears in two digests in a row, and nobody is nudged more than once in thirty days — regardless of score.",
      "Dismissing a nudge snoozes that person for half their cadence rather than forever.",
    ],
    why:
      "Without the damping, the same three chronically overdue people would fill every digest until you stopped reading it.",
  },
  {
    id: "tags",
    title: "Tags and saved views",
    what:
      "Tags turn a list of names into something you can query before a trip or a conference.",
    how: [
      "Four kinds: context (how you know them), industry (their field), city (trip planning) and strength (how warm it is).",
      "The parser invents tags freely at capture time — there's no fixed vocabulary to learn.",
      "Filter on /people by tag, city, how long it's been, overdue, untagged, or met-cold.",
      "Save any filter combination as a named view. Saved views appear on the home screen.",
      "Merge near-duplicate tags on /tags — “fintech” and “fin-tech” become one.",
    ],
    why:
      "Forcing a tidy taxonomy up front is the fastest way to stop using a system. Let it get messy, tidy it later in one pass.",
  },
  {
    id: "network",
    title: "Network",
    what:
      "Who introduced you to whom. One field at capture time builds a map that a contact list can't.",
    how: [
      "Say “Arjun introduced us” in a capture and the link is recorded. Set or change it later from the person's page.",
      "Connectors ranks people by how many contacts they brought you — these are the relationships that compound.",
      "Met cold lists people who arrived with no introduction. They lapse fastest and deserve a tighter cadence.",
      "Could introduce you to suggests second-degree reach based on shared tags.",
      "Favours to return flags anyone who has introduced you to three or more people when you've introduced them to none.",
    ],
  },
  {
    id: "settings",
    title: "Settings and the parse log",
    what: "Where the digest goes, and what the parser actually saw.",
    how: [
      "Set an email address and frequency for the digest. Without an email provider configured, digests are written to disk and shown at /digest.",
      "If three digests in a row go unopened, the frequency drops to fortnightly on its own.",
      "The parse log shows every capture you've typed alongside the fields it produced.",
    ],
    why:
      "When the parser gets something wrong, the log lets you see exactly what it saw — which is the only way to tell a bad sentence from a bad parse.",
  },
];

export default function GuidePage() {
  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-serif text-[2rem] leading-tight">How this works</h1>
        <p className="text-ink-soft mt-2 max-w-2xl text-[0.9375rem] leading-relaxed">
          A personal CRM for remembering people properly and staying in touch on purpose
          rather than by accident. The whole thing is built on one rule:{" "}
          <em>capture has to be frictionless, review has to be batched.</em> Anything that
          slows down writing someone down got moved or cut.
        </p>
      </header>

      <nav className="card p-4">
        <p className="label-xs mb-2">Jump to</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-accent text-sm hover:underline">
              {s.title}
            </a>
          ))}
        </div>
      </nav>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-6">
          <h2 className="font-serif text-xl leading-tight">{s.title}</h2>
          <p className="text-ink-soft mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed">{s.what}</p>
          <ul className="mt-3 max-w-2xl space-y-1.5">
            {s.how.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[0.9375rem] leading-relaxed">
                <span className="text-ink-faint mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-current" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {s.why && (
            <p className="border-accent/40 text-ink-soft mt-3 max-w-2xl border-l-2 py-0.5 pl-3 text-[0.875rem] leading-relaxed italic">
              {s.why}
            </p>
          )}
        </section>
      ))}

      <section className="border-line border-t pt-6">
        <h2 className="font-serif text-xl leading-tight">Getting started</h2>
        <ol className="text-ink-soft mt-2 max-w-2xl list-decimal space-y-1.5 pl-5 text-[0.9375rem] leading-relaxed">
          <li>
            Capture three or four people you met recently from{" "}
            <Link href="/" className="text-accent hover:underline">the home screen</Link>. Don&rsquo;t
            tidy them — just get them down.
          </li>
          <li>Open one and add a soft detail you remember. That&rsquo;s the part that pays off later.</li>
          <li>Set a cadence on the ones you actually want to keep warm; leave the rest.</li>
          <li>
            Look at <Link href="/digest" className="text-accent hover:underline">the digest</Link>{" "}
            preview. It&rsquo;ll be thin until there&rsquo;s history — that&rsquo;s expected.
          </li>
        </ol>
      </section>
    </div>
  );
}
