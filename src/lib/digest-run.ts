import { todayISO, type ISODate } from "./dates";
import { allPeople } from "./people";
import { nudgeHistoryFor } from "./nudge";
import {
  applyOpenRateBackoff, composeDigest, digestDueOn, getSettings, lastDigest,
  newDigestId, saveDigest, type DigestEntry,
} from "./digest";
import { deliverDigest, renderDigestHtml } from "./digest-email";

export interface DigestRun {
  status: "sent" | "not_due" | "no_one";
  digestId?: string;
  entries: DigestEntry[];
  delivery?: string;
  frequency: "weekly" | "fortnightly";
}

export function baseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Builds and delivers the Monday digest. `force` bypasses the due-date check so
 * the digest can be previewed or sent on demand from the app.
 */
export async function runDigest(
  options: { force?: boolean; today?: ISODate } = {},
): Promise<DigestRun> {
  const today = options.today ?? todayISO();
  const frequency = applyOpenRateBackoff();
  const previous = lastDigest();

  if (!options.force && !digestDueOn(today, previous, frequency)) {
    return { status: "not_due", entries: [], frequency };
  }

  const people = allPeople();
  const history = nudgeHistoryFor(people.map((p) => p.id), previous?.id ?? null);
  const entries = composeDigest(people, today, history);

  if (!entries.length) return { status: "no_one", entries: [], frequency };

  const id = newDigestId();
  const html = renderDigestHtml(entries, today, id, baseUrl());
  const settings = getSettings();
  const delivery = await deliverDigest(html, subjectFor(entries), settings.digest_email, today);

  saveDigest(id, today, entries, html, delivery.delivery);
  return { status: "sent", digestId: id, entries, delivery: delivery.detail, frequency };
}

function subjectFor(entries: DigestEntry[]): string {
  const birthdays = entries.filter((e) => e.slot === "birthday");
  if (birthdays.length) {
    return `${birthdays[0].person.name}'s birthday, and ${entries.length - 1} others worth a message`;
  }
  return `${entries.length} people worth a message this week`;
}

/** A preview of what the next digest would contain, without sending anything. */
export function previewDigest(today: ISODate = todayISO()): DigestEntry[] {
  const people = allPeople();
  const previous = lastDigest();
  const history = nudgeHistoryFor(people.map((p) => p.id), previous?.id ?? null);
  return composeDigest(people, today, history);
}
