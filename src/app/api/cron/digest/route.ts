import { NextResponse } from "next/server";
import { runDigest } from "@/lib/digest-run";
import { authoriseCron } from "../auth";

/**
 * The Monday digest. Runs safely every day: it no-ops unless a digest is
 * actually due under the current frequency. `?force=1` sends regardless.
 */
export async function GET(request: Request) {
  const denied = authoriseCron(request);
  if (denied) return denied;

  const force = new URL(request.url).searchParams.get("force") === "1";
  const run = await runDigest({ force });

  return NextResponse.json({
    status: run.status,
    frequency: run.frequency,
    delivery: run.delivery ?? null,
    digest_id: run.digestId ?? null,
    people: run.entries.map((e) => ({ name: e.person.name, slot: e.slot, score: Number(e.score.toFixed(3)) })),
  });
}
