import { describe, it, expect } from "vitest";
import {
  NUDGE_COOLDOWN_DAYS, birthdaySoon, daysOverdue, isOverdueEligible, isSnoozed,
  passesDampening, priorityScore, rankOverdue, snoozeUntilForDismissal,
} from "@/lib/nudge";
import type { Person } from "@/lib/types";

const TODAY = "2026-09-21";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1", name: "Test", how_we_met: null, company: null, role: null, city: null,
    birthday_month: null, birthday_day: null, birthday_year: null,
    cadence_days: 90, notes: null, last_contacted_at: null, snoozed_until: null,
    created_at: "2020-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("overdue calculation", () => {
  it("days_overdue = (today - last_contacted_at) - cadence_days", () => {
    const p = person({ last_contacted_at: "2026-05-01", cadence_days: 90 });
    expect(daysOverdue(p, TODAY)).toBe(143 - 90);
  });

  it("falls back to created_at when last_contacted_at is null, so a new person still enters the cycle", () => {
    const p = person({ last_contacted_at: null, created_at: "2026-01-01T00:00:00.000Z", cadence_days: 90 });
    expect(daysOverdue(p, TODAY)).toBe(263 - 90);
  });

  it("a null cadence means never nudge", () => {
    expect(daysOverdue(person({ cadence_days: null }), TODAY)).toBeNull();
    expect(isOverdueEligible(person({ cadence_days: null }), TODAY)).toBe(false);
  });

  it("only counts as eligible when days_overdue is greater than zero", () => {
    expect(isOverdueEligible(person({ last_contacted_at: "2026-06-23", cadence_days: 90 }), TODAY)).toBe(false);
    expect(isOverdueEligible(person({ last_contacted_at: "2026-06-22", cadence_days: 90 }), TODAY)).toBe(true);
  });

  it("a future snooze suppresses eligibility without deleting the cadence", () => {
    const p = person({ last_contacted_at: "2025-01-01", snoozed_until: "2026-10-01" });
    expect(isSnoozed(p, TODAY)).toBe(true);
    expect(isOverdueEligible(p, TODAY)).toBe(false);
    expect(p.cadence_days).toBe(90);
  });

  it("a past snooze no longer suppresses", () => {
    const p = person({ last_contacted_at: "2025-01-01", snoozed_until: "2026-09-20" });
    expect(isOverdueEligible(p, TODAY)).toBe(true);
  });
});

describe("priority scoring", () => {
  it("normalises urgency, so 30 days past a 30-day cadence outranks 30 past a year", () => {
    const tight = person({ id: "a", last_contacted_at: "2026-07-23", cadence_days: 30 });
    const loose = person({ id: "b", last_contacted_at: "2025-08-22", cadence_days: 365 });
    expect(daysOverdue(tight, TODAY)).toBe(30);
    expect(daysOverdue(loose, TODAY)).toBe(30);
    expect(priorityScore(tight, TODAY)).toBeGreaterThan(priorityScore(loose, TODAY));
    expect(rankOverdue([loose, tight], TODAY)[0].person.id).toBe("a");
  });

  it("gives a birthday a boost of exactly 2", () => {
    const base = person({ last_contacted_at: "2026-06-22", cadence_days: 90 });
    const withBirthday = { ...base, birthday_month: 9, birthday_day: 28 };
    expect(priorityScore(withBirthday, TODAY) - priorityScore(base, TODAY)).toBeCloseTo(2);
  });

  it("gives a recently added contact a boost of exactly 0.5", () => {
    const old = person({ created_at: "2020-01-01T00:00:00.000Z", last_contacted_at: "2026-06-22" });
    const fresh = { ...old, created_at: "2026-09-10T00:00:00.000Z" };
    expect(priorityScore(fresh, TODAY) - priorityScore(old, TODAY)).toBeCloseTo(0.5);
  });

  it("only surfaces birthdays inside the fourteen-day window", () => {
    expect(birthdaySoon(person({ birthday_month: 10, birthday_day: 5 }), TODAY)).toBe(true);  // 14 days
    expect(birthdaySoon(person({ birthday_month: 10, birthday_day: 6 }), TODAY)).toBe(false); // 15 days
    expect(birthdaySoon(person({ birthday_month: 9, birthday_day: 20 }), TODAY)).toBe(false); // just passed
  });
});

describe("dampening rules", () => {
  const p = person({ birthday_month: null, birthday_day: null });

  it("never shows the same person in two consecutive digests", () => {
    expect(passesDampening(p, { lastShownOn: "2026-09-14", inPreviousDigest: true }, TODAY)).toBe(false);
  });

  it("unless it is their birthday", () => {
    const birthdayPerson = person({ birthday_month: 9, birthday_day: 24 });
    expect(passesDampening(birthdayPerson, { lastShownOn: "2026-09-14", inPreviousDigest: true }, TODAY)).toBe(true);
  });

  it("caps at one nudge per person per thirty days regardless of score", () => {
    expect(passesDampening(p, { lastShownOn: "2026-08-30", inPreviousDigest: false }, TODAY)).toBe(false); // 22 days
    expect(passesDampening(p, { lastShownOn: "2026-08-22", inPreviousDigest: false }, TODAY)).toBe(true);  // 30 days
    expect(NUDGE_COOLDOWN_DAYS).toBe(30);
  });

  it("lets through someone never nudged", () => {
    expect(passesDampening(p, { lastShownOn: null, inPreviousDigest: false }, TODAY)).toBe(true);
  });

  it("dismissing a nudge snoozes for half the cadence", () => {
    expect(snoozeUntilForDismissal(person({ cadence_days: 90 }), TODAY)).toBe("2026-11-05"); // +45
    expect(snoozeUntilForDismissal(person({ cadence_days: 30 }), TODAY)).toBe("2026-10-06"); // +15
  });
});
