import { describe, it, expect } from "vitest";
import {
  addDays, daysBetween, daysUntilBirthday, formatBirthday, isLeapYear,
  nextBirthdayOccurrence, observedBirthday, relativeLabel, resolveRelativeDate,
} from "@/lib/dates";

describe("birthday lookahead", () => {
  it("compares day and month only, ignoring the birth year", () => {
    expect(nextBirthdayOccurrence(11, 3, "2026-09-21")).toBe("2026-11-03");
  });

  it("wraps around December and January", () => {
    expect(daysUntilBirthday(1, 4, "2026-12-28")).toBe(7);
    expect(nextBirthdayOccurrence(1, 4, "2026-12-28")).toBe("2027-01-04");
  });

  it("counts a birthday today as zero days away, not a year", () => {
    expect(daysUntilBirthday(9, 21, "2026-09-21")).toBe(0);
  });

  it("rolls February 29 to March 1 in non-leap years", () => {
    expect(observedBirthday(2, 29, 2027)).toBe("2027-03-01");
    expect(observedBirthday(2, 29, 2028)).toBe("2028-02-29");
    expect(nextBirthdayOccurrence(2, 29, "2027-02-20")).toBe("2027-03-01");
  });

  it("knows its leap years, century rule included", () => {
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2027)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });
});

describe("relative dates resolve against the capture date", () => {
  const capture = "2026-09-21"; // Monday

  it("'last Tuesday' is the Tuesday before the capture, not today", () => {
    expect(resolveRelativeDate("met her last Tuesday", capture)).toBe("2026-09-15");
  });

  it("'yesterday'", () => expect(resolveRelativeDate("yesterday", capture)).toBe("2026-09-20"));

  it("'three weeks ago'", () =>
    expect(resolveRelativeDate("called him 3 weeks ago", capture)).toBe("2026-08-31"));

  it("a bare day and month is read as the most recent one, not next year", () => {
    expect(resolveRelativeDate("coffee on 12 March", capture)).toBe("2026-03-12");
    expect(resolveRelativeDate("coffee on 12 December", capture)).toBe("2025-12-12");
  });

  it("returns null when the text carries no date", () => {
    expect(resolveRelativeDate("met Priya at the meetup", capture)).toBeNull();
  });
});

describe("date arithmetic", () => {
  it("adds and subtracts days across month ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("counts whole days between dates", () => {
    expect(daysBetween("2026-09-01", "2026-09-21")).toBe(20);
    expect(daysBetween("2026-09-21", "2026-09-01")).toBe(-20);
  });
  it("labels distances in human units", () => {
    expect(relativeLabel("2026-09-21", "2026-09-21")).toBe("today");
    expect(relativeLabel("2026-09-14", "2026-09-21")).toBe("7 days ago");
    expect(relativeLabel("2026-06-21", "2026-09-21")).toBe("3 months ago");
  });
  it("formats a birthday with and without a year", () => {
    expect(formatBirthday(3, 4, null)).toBe("4 March");
    expect(formatBirthday(3, 4, 1991)).toBe("4 March 1991");
  });
});
