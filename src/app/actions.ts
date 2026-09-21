"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { buildDrafts, commitDraft, type DraftPerson } from "@/lib/capture";
import { addDays, todayISO } from "@/lib/dates";
import {
  digestEntries, getDigest, getSettings, updateSettings as persistSettings,
} from "@/lib/digest";
import { runDigest } from "@/lib/digest-run";
import { addIntroduction, removeIntroduction } from "@/lib/graph";
import {
  deleteInteraction, deletePerson, logInteraction, setCadence, snoozePerson,
  updatePerson,
} from "@/lib/people";
import { activeModel, activeProvider, parseCapture } from "@/lib/parse";
import { fallbackParse } from "@/lib/parse/fallback";
import type { ParsedPerson } from "@/lib/parse/schema";
import { recordNudgeOutcome, snoozeUntilForDismissal } from "@/lib/nudge";
import { getDb } from "@/lib/db";
import { getPerson } from "@/lib/people";
import { mergeTags, renameTag, replacePersonTags } from "@/lib/tags";
import { deleteView, saveView, type Filters } from "@/lib/views";
import type { Channel, TagKind } from "@/lib/types";

export interface ParseActionResult {
  drafts: DraftPerson[];
  provider: string;
  model: string | null;
  usedFallback: boolean;
  error: string | null;
}

/** Step one of capture: text in, editable draft cards out. Nothing is saved yet. */
export async function parseCaptureAction(text: string): Promise<ParseActionResult> {
  const input = text.trim();
  if (!input) {
    return { drafts: [], provider: activeProvider(), model: activeModel(), usedFallback: false, error: null };
  }
  const outcome = await parseCapture(input, todayISO());
  return {
    drafts: buildDrafts(outcome.result.people),
    provider: outcome.provider,
    model: outcome.model,
    usedFallback: outcome.source === "fallback",
    error: outcome.error,
  };
}

export interface CommitInput {
  parsed: ParsedPerson;
  target: "new" | string;
  cadenceDays: number | null;
}

/** Step two: save the confirmed cards. */
export async function commitCaptureAction(drafts: CommitInput[]): Promise<{ personIds: string[] }> {
  const personIds = drafts.map(
    (d) => commitDraft(d.parsed, { target: d.target, cadenceDays: d.cadenceDays }).personId,
  );
  revalidatePath("/");
  revalidatePath("/people");
  return { personIds };
}

/**
 * Quick-log: open a person, type a sentence, done. Writes an interaction and
 * resets their overdue clock. The sentence is parsed for a date and channel
 * with the deterministic rules — no round trip, because this path has to be
 * instant.
 */
export async function quickLogAction(personId: string, formData: FormData): Promise<void> {
  const text = String(formData.get("summary") ?? "").trim();
  if (!text) return;
  const today = todayISO();
  const explicitDate = String(formData.get("occurred_on") ?? "").trim();
  const explicitChannel = String(formData.get("channel") ?? "").trim() as Channel | "";
  const [guess] = fallbackParse(text, today).people;

  logInteraction(personId, {
    occurred_on: explicitDate || guess.interaction?.occurred_on || today,
    channel: (explicitChannel || guess.interaction?.channel || "met") as Channel,
    summary: text,
  });
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
}

export async function setCadenceAction(personId: string, days: number | null): Promise<void> {
  setCadence(personId, days);
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
}

export async function snoozeAction(personId: string, days?: number): Promise<void> {
  const person = getPerson(personId);
  if (!person) return;
  const today = todayISO();
  snoozePerson(personId, days ? addDays(today, days) : snoozeUntilForDismissal(person, today));
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
}

export async function unsnoozeAction(personId: string): Promise<void> {
  updatePerson(personId, { snoozed_until: null });
  revalidatePath(`/people/${personId}`);
  revalidatePath("/");
}

export async function updatePersonAction(personId: string, formData: FormData): Promise<void> {
  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v ? v : null;
  };
  const birthday = str("birthday"); // MM-DD or YYYY-MM-DD
  let month: number | null = null, day: number | null = null, year: number | null = null;
  if (birthday) {
    const full = birthday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const partial = birthday.match(/^(\d{1,2})-(\d{1,2})$/);
    if (full) { year = Number(full[1]); month = Number(full[2]); day = Number(full[3]); }
    else if (partial) { month = Number(partial[1]); day = Number(partial[2]); }
  }

  updatePerson(personId, {
    name: str("name") ?? "Unnamed",
    company: str("company"),
    role: str("role"),
    city: str("city"),
    how_we_met: str("how_we_met"),
    notes: str("notes"),
    birthday_month: month,
    birthday_day: day,
    birthday_year: year,
  });

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((name) => ({ name, kind: null }));
  replacePersonTags(personId, tags);

  revalidatePath(`/people/${personId}`);
}

export async function deletePersonAction(personId: string): Promise<void> {
  deletePerson(personId);
  revalidatePath("/people");
  redirect("/people");
}

export async function deleteInteractionAction(personId: string, interactionId: string): Promise<void> {
  deleteInteraction(interactionId);
  revalidatePath(`/people/${personId}`);
}

export async function setIntroducerAction(personId: string, introducerId: string | null): Promise<void> {
  const db = getDb();
  const existing = db
    .prepare(`SELECT introduced_by_id FROM introductions WHERE person_id = ?`)
    .all(personId) as { introduced_by_id: string }[];
  for (const row of existing) removeIntroduction(personId, row.introduced_by_id);
  if (introducerId) addIntroduction(personId, introducerId, null);
  revalidatePath(`/people/${personId}`);
  revalidatePath("/network");
}

// --------------------------------------------------------------- saved views

export async function saveViewAction(name: string, filters: Filters): Promise<void> {
  if (!name.trim()) return;
  saveView(name, filters);
  revalidatePath("/people");
  revalidatePath("/");
}

export async function deleteViewAction(id: string): Promise<void> {
  deleteView(id);
  revalidatePath("/people");
  revalidatePath("/");
}

// ---------------------------------------------------------------------- tags

export async function mergeTagsAction(keepId: string, mergeId: string): Promise<void> {
  mergeTags(keepId, mergeId);
  revalidatePath("/tags");
}

export async function renameTagAction(id: string, name: string, kind: TagKind | null): Promise<void> {
  renameTag(id, name, kind);
  revalidatePath("/tags");
}

// -------------------------------------------------------------------- digest

export async function sendDigestAction(): Promise<void> {
  await runDigest({ force: true });
  revalidatePath("/digest");
  revalidatePath("/");
}

export type DigestOutcome = "log" | "snooze" | "not_now";

/** The four actions on a digest entry, shared by the email links and the app. */
export async function digestEntryAction(
  digestId: string,
  personId: string,
  outcome: DigestOutcome,
): Promise<void> {
  const person = getPerson(personId);
  if (!person) return;
  const today = todayISO();

  if (outcome === "log") {
    logInteraction(personId, { occurred_on: today, channel: "message", summary: "Logged from the digest" });
    recordNudgeOutcome(personId, digestId, "logged");
  } else if (outcome === "snooze") {
    snoozePerson(personId, snoozeUntilForDismissal(person, today));
    recordNudgeOutcome(personId, digestId, "snoozed");
  } else {
    // "Not now" drops them from this week only: the nudge record is removed so
    // the thirty-day cooldown doesn't penalise a nudge they never acted on.
    recordNudgeOutcome(personId, digestId, "not_now");
    getDb().prepare(`DELETE FROM nudges WHERE person_id = ? AND digest_id = ?`).run(personId, digestId);
    const digest = getDigest(digestId);
    if (digest) {
      const ids = (JSON.parse(digest.person_ids) as string[]).filter((id) => id !== personId);
      getDb().prepare(`UPDATE digests SET person_ids = ? WHERE id = ?`).run(JSON.stringify(ids), digestId);
    }
  }

  revalidatePath("/digest");
  revalidatePath("/");
}

export async function digestCadenceAction(
  digestId: string,
  personId: string,
  days: number | null,
): Promise<void> {
  setCadence(personId, days);
  recordNudgeOutcome(personId, digestId, "cadence_changed");
  revalidatePath("/digest");
}

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const email = String(formData.get("digest_email") ?? "").trim();
  const frequency = String(formData.get("digest_frequency") ?? "weekly");
  const timezone = String(formData.get("timezone") ?? "UTC").trim();
  persistSettings({
    digest_email: email || null,
    digest_frequency: frequency === "fortnightly" ? "fortnightly" : "weekly",
    timezone: timezone || "UTC",
  });
  revalidatePath("/settings");
}

export async function currentDigestEntriesAction(digestId: string) {
  const digest = getDigest(digestId);
  return digest ? digestEntries(digest) : [];
}

export async function currentSettingsAction() {
  return getSettings();
}
