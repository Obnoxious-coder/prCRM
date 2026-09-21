/**
 * Date helpers. Everything is a plain YYYY-MM-DD string and all arithmetic runs
 * in UTC, so a person's overdue count never shifts because the server moved.
 */

export type ISODate = string; // YYYY-MM-DD

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function fromISO(s: ISODate): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * The next calendar date on which a day/month birthday falls, on or after
 * `from`. Compares day and month only, wraps across the December/January
 * boundary, and rolls February 29 to March 1 in non-leap years.
 */
export function nextBirthdayOccurrence(
  month: number,
  day: number,
  from: ISODate,
): ISODate {
  const fromDate = fromISO(from);
  const startYear = fromDate.getUTCFullYear();
  for (const year of [startYear, startYear + 1]) {
    const observed = observedBirthday(month, day, year);
    if (daysBetween(from, observed) >= 0) return observed;
  }
  // Unreachable for valid input; keeps the return type honest.
  return observedBirthday(month, day, startYear + 1);
}

/** Where a day/month birthday actually lands in a given year. */
export function observedBirthday(month: number, day: number, year: number): ISODate {
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    return `${year}-03-01`;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Days from `from` until the next occurrence of this birthday. */
export function daysUntilBirthday(
  month: number,
  day: number,
  from: ISODate,
): number {
  return daysBetween(from, nextBirthdayOccurrence(month, day, from));
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const WEEKDAYS = [
  "sunday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday",
];

/**
 * Resolves phrases like "last Tuesday", "yesterday" or "on 12 March" against
 * the capture date rather than defaulting to today. Returns null when the text
 * carries no date at all, which is the common case.
 */
export function resolveRelativeDate(
  text: string,
  reference: ISODate,
): ISODate | null {
  const t = text.toLowerCase();

  if (/\byesterday\b/.test(t)) return addDays(reference, -1);
  if (/\b(today|just now|this morning|this afternoon|tonight)\b/.test(t)) return reference;
  if (/\bday before yesterday\b/.test(t)) return addDays(reference, -2);

  const ago = t.match(/\b(\d+|a|an|couple of|few)\s+(day|week|month|year)s?\s+ago\b/);
  if (ago) {
    const n = ago[1] === "a" || ago[1] === "an" ? 1
      : ago[1] === "couple of" ? 2
      : ago[1] === "few" ? 3
      : parseInt(ago[1], 10);
    const unit = ago[2];
    const mult = unit === "day" ? 1 : unit === "week" ? 7 : unit === "month" ? 30 : 365;
    return addDays(reference, -n * mult);
  }

  // "last Tuesday" / "on Tuesday" / "this Tuesday" — always the most recent one.
  const weekday = t.match(/\b(last|this|on|past)\s+(sun|mon|tues|tue|wednes|wed|thurs|thu|fri|satur|sat)(day)?\b/);
  if (weekday) {
    const target = WEEKDAYS.findIndex((d) => d.startsWith(normaliseWeekday(weekday[2])));
    if (target >= 0) {
      const refDow = fromISO(reference).getUTCDay();
      let delta = refDow - target;
      if (delta <= 0) delta += 7; // strictly in the past
      return addDays(reference, -delta);
    }
  }

  // "12 March" / "March 12" / "12 Mar 2024"
  const dmy = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?\b/);
  if (dmy) {
    const m = monthIndex(dmy[2]);
    if (m) return clampToPast(m, parseInt(dmy[1], 10), dmy[3], reference);
  }
  const mdy = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (mdy) {
    const m = monthIndex(mdy[1]);
    if (m) return clampToPast(m, parseInt(mdy[2], 10), mdy[3], reference);
  }

  const iso = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function normaliseWeekday(s: string): string {
  return ({ tue: "tues", wed: "wednes", thu: "thurs", sat: "satur" } as Record<string, string>)[s] ?? s;
}

/** A bare day+month in a capture is a past event, not one eleven months out. */
function clampToPast(month: number, day: number, year: string | undefined, reference: ISODate): ISODate {
  if (year) return `${year}-${pad(month)}-${pad(day)}`;
  const refYear = fromISO(reference).getUTCFullYear();
  const candidate = `${refYear}-${pad(month)}-${pad(day)}`;
  return daysBetween(reference, candidate) > 0
    ? `${refYear - 1}-${pad(month)}-${pad(day)}`
    : candidate;
}

export function monthIndex(name: string): number | null {
  const n = name.toLowerCase().replace(/\.$/, "");
  const i = MONTHS.findIndex((m) => m === n || (n.length >= 3 && m.startsWith(n)));
  return i >= 0 ? i + 1 : null;
}

/** "3 weeks ago", "today", "in 5 days" — for display next to a date. */
export function relativeLabel(date: ISODate, from: ISODate): string {
  const d = daysBetween(from, date);
  if (d === 0) return "today";
  const past = d < 0;
  const n = Math.abs(d);
  const unit =
    n === 1 ? "1 day"
    : n < 14 ? `${n} days`
    : n < 60 ? `${Math.round(n / 7)} weeks`
    : n < 365 ? `${Math.round(n / 30)} months`
    : `${(n / 365).toFixed(n % 365 === 0 ? 0 : 1)} years`;
  return past ? `${unit} ago` : `in ${unit}`;
}

export function formatDate(date: ISODate): string {
  const d = fromISO(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${d.getUTCFullYear()}`;
}

export function formatBirthday(month: number, day: number, year: number | null): string {
  const m = MONTHS[month - 1].replace(/^./, (c) => c.toUpperCase());
  return year ? `${day} ${m} ${year}` : `${day} ${m}`;
}
