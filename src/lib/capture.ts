import { addIntroduction } from "./graph";
import {
  createPerson, distinguishingDetail, logInteraction, mergeIntoPerson,
  nameCandidates, setCadence, type SavePersonInput,
} from "./people";
import { todayISO, type ISODate } from "./dates";
import type { ParsedPerson } from "./parse/schema";
import type { Person } from "./types";

/**
 * The step between a parse and a saved record.
 *
 * Two people called Rahul is the normal case, not the exception, so a name that
 * matches more than one existing person is never merged silently — the confirm
 * card shows both candidates with a distinguishing detail and a Create new
 * option, and the caller decides.
 */

export interface Candidate {
  person: Person;
  detail: string;
}

export interface DraftPerson {
  parsed: ParsedPerson;
  /** Existing people whose name matches. Empty for a genuinely new contact. */
  candidates: Candidate[];
  /** Pre-selected target: the single unambiguous match, else "new". */
  suggestion: "new" | string;
}

export function buildDrafts(people: ParsedPerson[]): DraftPerson[] {
  return people.map((parsed) => {
    const matches = nameCandidates(parsed.name);
    const candidates = matches.map((person) => ({ person, detail: distinguishingDetail(person) }));
    const exact = matches.filter((m) => m.name.toLowerCase() === parsed.name.trim().toLowerCase());
    return {
      parsed,
      candidates,
      suggestion: exact.length === 1 ? exact[0].id : "new",
    };
  });
}

export interface CommitOptions {
  /** "new" creates a record; any other value merges into that person. */
  target: "new" | string;
  cadenceDays?: number | null;
  captureDate?: ISODate;
}

export interface CommitResult {
  personId: string;
  created: boolean;
  introducedById: string | null;
  introducedByCreated: boolean;
}

/** Saves one draft and logs the interaction that came with it. */
export function commitDraft(parsed: ParsedPerson, options: CommitOptions): CommitResult {
  const captureDate = options.captureDate ?? todayISO();
  let personId: string;
  let created = false;

  if (options.target === "new") {
    const input: SavePersonInput = { ...parsed, cadence_days: options.cadenceDays };
    personId = createPerson(input, captureDate);
    created = true;
  } else {
    personId = options.target;
    mergeIntoPerson(personId, parsed);
    if (options.cadenceDays !== undefined) {
      // An explicit cadence change from the confirm card still applies.
      setCadence(personId, options.cadenceDays);
    }
  }

  if (parsed.interaction) {
    logInteraction(personId, {
      occurred_on: parsed.interaction.occurred_on ?? captureDate,
      channel: parsed.interaction.channel,
      summary: parsed.interaction.summary,
    });
  }

  let introducedById: string | null = null;
  let introducedByCreated = false;
  if (parsed.introduced_by?.trim()) {
    const resolved = resolveIntroducer(parsed.introduced_by.trim(), captureDate);
    introducedById = resolved.id;
    introducedByCreated = resolved.created;
    addIntroduction(personId, introducedById, parsed.interaction?.occurred_on ?? captureDate);
  }

  return { personId, created, introducedById, introducedByCreated };
}

/**
 * The introducer is usually already a contact. When they are not, they get a
 * stub record — a name is a valid record, and a connector you can't see is a
 * connector you can't use.
 */
function resolveIntroducer(name: string, captureDate: ISODate): { id: string; created: boolean } {
  const matches = nameCandidates(name);
  const exact = matches.find((m) => m.name.toLowerCase() === name.toLowerCase());
  if (exact) return { id: exact.id, created: false };
  if (matches.length === 1) return { id: matches[0].id, created: false };
  const id = createPerson(
    {
      name,
      company: null, role: null, city: null, how_we_met: null,
      notes: null, birthday: null, introduced_by: null, tags: [], interaction: null,
    },
    captureDate,
  );
  return { id, created: true };
}
