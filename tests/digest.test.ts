import { describe, it, expect } from "vitest";
import { composeDigest, digestDueOn, softDetail, entryReason } from "@/lib/digest";
import type { Person } from "@/lib/types";

const TODAY = "2026-09-21"; // Monday
const NO_HISTORY = new Map<string, { lastShownOn: string | null; inPreviousDigest: boolean }>();
const firstWildcard = () => 0;

function person(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id, name: `Person ${id}`, how_we_met: null, company: null, role: null, city: null,
    birthday_month: null, birthday_day: null, birthday_year: null,
    cadence_days: 90, notes: null, last_contacted_at: "2026-01-01", snoozed_until: null,
    created_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("digest composition", () => {
  it("fills slots 1–2 with birthdays, 3–4 with overdue and 5 with a wildcard", () => {
    const people = [
      person("b1", { birthday_month: 9, birthday_day: 24, last_contacted_at: "2026-09-01" }),
      person("b2", { birthday_month: 10, birthday_day: 2, last_contacted_at: "2026-09-01" }),
      person("o1", { last_contacted_at: "2026-01-01", cadence_days: 30 }),
      person("o2", { last_contacted_at: "2026-03-01", cadence_days: 30 }),
      person("o3", { last_contacted_at: "2026-05-01", cadence_days: 90 }),
      person("w1", { last_contacted_at: "2024-01-01", cadence_days: null }),
    ];
    const entries = composeDigest(people, TODAY, NO_HISTORY, firstWildcard);
    expect(entries).toHaveLength(5);
    expect(entries.slice(0, 2).map((e) => e.slot)).toEqual(["birthday", "birthday"]);
    expect(entries.slice(2, 4).map((e) => e.slot)).toEqual(["overdue", "overdue"]);
    expect(entries[4].slot).toBe("wildcard");
  });

  it("lets overdue contacts fill the birthday slots when there are no birthdays", () => {
    const people = [
      person("o1", { last_contacted_at: "2026-01-01", cadence_days: 30 }),
      person("o2", { last_contacted_at: "2026-02-01", cadence_days: 30 }),
      person("o3", { last_contacted_at: "2026-03-01", cadence_days: 30 }),
      person("o4", { last_contacted_at: "2026-04-01", cadence_days: 30 }),
      person("o5", { last_contacted_at: "2026-05-01", cadence_days: 30 }),
    ];
    const entries = composeDigest(people, TODAY, NO_HISTORY, firstWildcard);
    expect(entries).toHaveLength(5);
    expect(entries.every((e) => e.slot === "overdue")).toBe(true);
  });

  it("picks the wildcard only from people not contacted in over a year", () => {
    const people = [
      person("recent", { last_contacted_at: "2026-08-01", cadence_days: 30 }),
      person("stale", { last_contacted_at: "2024-06-01", cadence_days: null }),
    ];
    const entries = composeDigest(people, TODAY, NO_HISTORY, firstWildcard);
    const wildcard = entries.find((e) => e.slot === "wildcard");
    expect(wildcard?.person.id).toBe("stale");
  });

  it("never repeats a person across slots", () => {
    const people = [
      person("x", { birthday_month: 9, birthday_day: 23, last_contacted_at: "2020-01-01", cadence_days: 30 }),
      person("y", { last_contacted_at: "2026-01-01", cadence_days: 30 }),
    ];
    const entries = composeDigest(people, TODAY, NO_HISTORY, firstWildcard);
    expect(new Set(entries.map((e) => e.person.id)).size).toBe(entries.length);
  });

  it("applies dampening — someone in the previous digest is skipped", () => {
    const people = [
      person("shown", { last_contacted_at: "2026-01-01", cadence_days: 30 }),
      person("fresh", { last_contacted_at: "2026-02-01", cadence_days: 30 }),
    ];
    const history = new Map([["shown", { lastShownOn: "2026-09-14", inPreviousDigest: true }]]);
    const entries = composeDigest(people, TODAY, history, firstWildcard);
    expect(entries.map((e) => e.person.id)).toEqual(["fresh"]);
  });

  it("but shows them anyway when it is their birthday", () => {
    const people = [
      person("shown", { birthday_month: 9, birthday_day: 22, last_contacted_at: "2026-09-01" }),
    ];
    const history = new Map([["shown", { lastShownOn: "2026-09-14", inPreviousDigest: true }]]);
    const entries = composeDigest(people, TODAY, history, firstWildcard);
    expect(entries.map((e) => e.person.id)).toEqual(["shown"]);
  });

  it("returns nothing when nobody qualifies", () => {
    expect(composeDigest([person("a", { last_contacted_at: "2026-09-20" })], TODAY, NO_HISTORY, firstWildcard))
      .toHaveLength(0);
  });

  it("explains why each person is in the list", () => {
    const entries = composeDigest(
      [person("b", { birthday_month: 9, birthday_day: 22, last_contacted_at: "2026-09-01" })],
      TODAY, NO_HISTORY, firstWildcard,
    );
    expect(entryReason(entries[0])).toBe("Birthday tomorrow");
  });
});

describe("delivery cadence", () => {
  it("only goes out on a Monday", () => {
    expect(digestDueOn("2026-09-21", null, "weekly")).toBe(true);  // Monday
    expect(digestDueOn("2026-09-22", null, "weekly")).toBe(false); // Tuesday
  });

  it("waits a fortnight once it has dropped to fortnightly", () => {
    const last = { id: "d", sent_on: "2026-09-14", person_ids: "[]", html: "", opened_at: null, delivery: "file", created_at: "" };
    expect(digestDueOn("2026-09-21", last, "weekly")).toBe(true);
    expect(digestDueOn("2026-09-21", last, "fortnightly")).toBe(false);
    expect(digestDueOn("2026-09-28", last, "fortnightly")).toBe(true);
  });
});

describe("soft detail", () => {
  it("picks the line that gives you an opening", () => {
    expect(softDetail("Works in payments. Has a cat called Mango.")).toBe("Has a cat called Mango.");
  });
  it("falls back to the first line when nothing is obviously soft", () => {
    expect(softDetail("Spoke at the summit")).toBe("Spoke at the summit");
  });
  it("handles empty notes", () => expect(softDetail(null)).toBeNull());
});
