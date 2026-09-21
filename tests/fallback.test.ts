import { describe, it, expect } from "vitest";
import { fallbackParse, splitRecords } from "@/lib/parse/fallback";

const CAPTURE = "2026-09-21"; // a Monday

describe("fallback parser — the spec's worked example", () => {
  const [p] = fallbackParse(
    "met Priya at the Bangalore fintech meetup, she runs growth at a lending startup, has a cat called Mango, Arjun introduced us.",
    CAPTURE,
  ).people;

  it("pulls the name", () => expect(p.name).toBe("Priya"));
  it("pulls the city", () => expect(p.city).toBe("Bangalore"));
  it("pulls how we met, without duplicating the city", () =>
    expect(p.how_we_met).toBe("the fintech meetup"));
  it("pulls the role", () => expect(p.role).toBe("growth"));
  it("pulls the company", () => expect(p.company).toBe("a lending startup"));
  it("pulls who introduced us", () => expect(p.introduced_by).toBe("Arjun"));
  it("keeps the soft detail in notes", () => expect(p.notes).toMatch(/cat called Mango/));
  it("invents the tags", () => {
    const names = p.tags.map((t) => t.name);
    expect(names).toContain("fintech");
    expect(names).toContain("meetup");
  });
  it("logs an interaction dated to the capture", () => {
    expect(p.interaction?.channel).toBe("met");
    expect(p.interaction?.occurred_on).toBe(CAPTURE);
  });
});

describe("edge cases the spec calls out", () => {
  it("resolves relative dates against the capture date, not today", () => {
    const [p] = fallbackParse("met her last Tuesday, Sana from the design meetup", CAPTURE).people;
    expect(p.interaction?.occurred_on).toBe("2026-09-15"); // the Tuesday before
  });

  it("accepts a partial birthday and stores the year as null", () => {
    const [p] = fallbackParse("Rahul, birthday 3 March, works at Acme", CAPTURE).people;
    expect(p.birthday).toEqual({ month: 3, day: 3, year: null });
  });

  it("keeps a known birth year when one is given", () => {
    const [p] = fallbackParse("Meera, born 14 July 1991", CAPTURE).people;
    expect(p.birthday).toEqual({ month: 7, day: 14, year: 1991 });
  });

  it("splits a badge dump into several records", () => {
    const result = fallbackParse(
      ["Karan Shah — legal, Mumbai", "Sana Iqbal — design lead at Studio", "Rohan Das — fintech"].join("\n"),
      CAPTURE,
    );
    expect(result.people).toHaveLength(3);
    expect(result.people.map((p) => p.name)).toEqual(["Karan Shah", "Sana Iqbal", "Rohan Das"]);
  });

  it("splits a bare comma list of names", () => {
    expect(splitRecords("Priya, Rahul and Meera")).toEqual(["Priya", "Rahul", "Meera"]);
  });

  it("does not split a single prose sentence", () => {
    expect(splitRecords("met Priya at the meetup, she runs growth")).toHaveLength(1);
  });

  it("never blocks on a missing field — a bare name is a valid record", () => {
    const [p] = fallbackParse("Devika", CAPTURE).people;
    expect(p.name).toBe("Devika");
    expect(p.company).toBeNull();
  });
});

describe("channel inference", () => {
  const cases: [string, string][] = [
    ["called Rahul about the raise", "call"],
    ["emailed Priya the deck", "email"],
    ["texted Meera happy birthday", "message"],
    ["met Arjun for coffee", "met"],
  ];
  for (const [input, channel] of cases) {
    it(`${input} → ${channel}`, () => {
      expect(fallbackParse(input, CAPTURE).people[0].interaction?.channel).toBe(channel);
    });
  }
});
