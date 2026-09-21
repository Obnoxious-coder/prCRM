import { beforeAll, afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * End-to-end over the real database: text in, records out. Uses a throwaway
 * SQLite file so it never touches the working data.
 */

const tmp = path.join(os.tmpdir(), `crm-test-${Date.now()}`);
process.env.CRM_DB_PATH = path.join(tmp, "test.db");

const CAPTURE = "2026-09-21";

let lib: {
  buildDrafts: typeof import("@/lib/capture")["buildDrafts"];
  commitDraft: typeof import("@/lib/capture")["commitDraft"];
  fallbackParse: typeof import("@/lib/parse/fallback")["fallbackParse"];
  getPerson: typeof import("@/lib/people")["getPerson"];
  nameCandidates: typeof import("@/lib/people")["nameCandidates"];
  interactionsFor: typeof import("@/lib/people")["interactionsFor"];
  tagsForPerson: typeof import("@/lib/tags")["tagsForPerson"];
  introducedBy: typeof import("@/lib/graph")["introducedBy"];
  connectors: typeof import("@/lib/graph")["connectors"];
  queryPeople: typeof import("@/lib/views")["queryPeople"];
};

beforeAll(async () => {
  fs.mkdirSync(tmp, { recursive: true });
  const [capture, parse, people, tags, graph, views] = await Promise.all([
    import("@/lib/capture"),
    import("@/lib/parse/fallback"),
    import("@/lib/people"),
    import("@/lib/tags"),
    import("@/lib/graph"),
    import("@/lib/views"),
  ]);
  lib = {
    buildDrafts: capture.buildDrafts,
    commitDraft: capture.commitDraft,
    fallbackParse: parse.fallbackParse,
    getPerson: people.getPerson,
    nameCandidates: people.nameCandidates,
    interactionsFor: people.interactionsFor,
    tagsForPerson: tags.tagsForPerson,
    introducedBy: graph.introducedBy,
    connectors: graph.connectors,
    queryPeople: views.queryPeople,
  };
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function capture(text: string, target: "new" | string = "new") {
  const [parsed] = lib.fallbackParse(text, CAPTURE).people;
  return lib.commitDraft(parsed, { target, cadenceDays: 90, captureDate: CAPTURE });
}

describe("capture end to end", () => {
  it("turns one sentence into a person, an interaction, tags and an introduction edge", () => {
    const result = capture(
      "met Priya at the Bangalore fintech meetup, she runs growth at a lending startup, has a cat called Mango, Arjun introduced us.",
    );

    const priya = lib.getPerson(result.personId)!;
    expect(priya.name).toBe("Priya");
    expect(priya.city).toBe("Bangalore");
    expect(priya.company).toBe("a lending startup");
    expect(priya.cadence_days).toBe(90);
    expect(priya.notes).toMatch(/Mango/);

    // The interaction is logged and the overdue clock is reset to it.
    const history = lib.interactionsFor(result.personId);
    expect(history).toHaveLength(1);
    expect(history[0].occurred_on).toBe(CAPTURE);
    expect(priya.last_contacted_at).toBe(CAPTURE);

    // Tags arrive from the parse.
    expect(lib.tagsForPerson(result.personId).map((t) => t.name)).toEqual(
      expect.arrayContaining(["fintech", "meetup", "bangalore"]),
    );

    // The introducer gets a stub record and a directed edge.
    expect(result.introducedByCreated).toBe(true);
    expect(lib.introducedBy(result.personId)?.name).toBe("Arjun");
  });

  it("ranks the introducer as a connector once they bring a second person", () => {
    capture("met Rohan at a fintech dinner, Arjun introduced us");
    const top = lib.connectors(5);
    expect(top[0].name).toBe("Arjun");
    expect(top[0].introduction_count).toBe(2);
  });

  it("offers both candidates when a name is ambiguous instead of merging silently", () => {
    capture("met Rahul at the design meetup, he works at Foundry in Mumbai");
    capture("met Rahul at a wedding, he runs a bakery in Goa");

    const [draft] = lib.buildDrafts(lib.fallbackParse("called Rahul about the role", CAPTURE).people);
    expect(draft.candidates.length).toBe(2);
    expect(draft.suggestion).toBe("new"); // ambiguous — the user must choose
    expect(draft.candidates.map((c) => c.detail)).toEqual(
      expect.arrayContaining([expect.stringContaining("Foundry"), expect.stringContaining("bakery")]),
    );
  });

  it("merges into an existing record without overwriting what is already known", () => {
    const first = capture("met Sana at the design meetup, she works at Studio Halcyon");
    const before = lib.getPerson(first.personId)!;
    expect(before.company).toBe("Studio Halcyon");

    capture("Sana, plays bass in a covers band, based in Mumbai", first.personId);

    const after = lib.getPerson(first.personId)!;
    expect(after.company).toBe("Studio Halcyon"); // kept
    expect(after.city).toBe("Mumbai");            // filled in
    expect(after.notes).toMatch(/bass/);          // notes accumulate
    expect(lib.interactionsFor(first.personId)).toHaveLength(2);
  });

  it("splits a badge dump into separate records in one capture", () => {
    const parsed = lib.fallbackParse(
      ["Nikhil Verma — devtools, Hyderabad", "Lakshmi Iyer — hiring, Bangalore"].join("\n"),
      CAPTURE,
    );
    const ids = parsed.people.map((p) => lib.commitDraft(p, { target: "new", cadenceDays: 90, captureDate: CAPTURE }));
    expect(ids).toHaveLength(2);
    expect(ids.map((r) => lib.getPerson(r.personId)!.name)).toEqual(["Nikhil Verma", "Lakshmi Iyer"]);
  });

  it("answers the trip question: everyone in Mumbai, most overdue first", () => {
    const results = lib.queryPeople({ city: "Mumbai", sort: "overdue" }, CAPTURE);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.person.city === "Mumbai")).toBe(true);
  });

  it("answers the conference question: tagged fintech and quiet for six months", () => {
    const soon = lib.queryPeople({ tags: ["fintech"] }, CAPTURE);
    expect(soon.length).toBeGreaterThan(0);
    const quiet = lib.queryPeople({ tags: ["fintech"], quietForDays: 180 }, CAPTURE);
    expect(quiet.length).toBe(0); // all just captured today
  });
});
