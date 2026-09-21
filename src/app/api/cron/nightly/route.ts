import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/dates";
import { allPeople, recomputeLastContacted } from "@/lib/people";
import { birthdaySoon, rankOverdue } from "@/lib/nudge";
import { authoriseCron } from "../auth";

/**
 * The nightly job. Recomputes the denormalised contact dates, clears lapsed
 * snoozes and reports who is overdue. Point Vercel Cron (or any scheduler) at
 * this route.
 */
export async function GET(request: Request) {
  const denied = authoriseCron(request);
  if (denied) return denied;

  const db = getDb();
  const today = todayISO();

  const ids = (db.prepare(`SELECT id FROM people`).all() as { id: string }[]).map((r) => r.id);
  for (const id of ids) recomputeLastContacted(id);

  const cleared = db
    .prepare(`UPDATE people SET snoozed_until = NULL WHERE snoozed_until IS NOT NULL AND snoozed_until <= ?`)
    .run(today).changes;

  const people = allPeople();
  const overdue = rankOverdue(people, today);
  const birthdays = people.filter((p) => birthdaySoon(p, today));

  return NextResponse.json({
    ran_on: today,
    people: people.length,
    snoozes_cleared: cleared,
    overdue: overdue.length,
    birthdays_within_14_days: birthdays.length,
    top: overdue.slice(0, 5).map((s) => ({
      name: s.person.name,
      days_overdue: s.days_overdue,
      score: Number(s.score.toFixed(3)),
    })),
  });
}
