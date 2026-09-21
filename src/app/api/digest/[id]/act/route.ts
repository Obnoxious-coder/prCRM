import { NextResponse } from "next/server";
import { digestEntryAction, type DigestOutcome } from "@/app/actions";

/**
 * The action links in the email. Each one performs the action and bounces the
 * reader to the digest page so they can see it took effect.
 */
const ACTIONS: Record<string, DigestOutcome> = {
  log: "log",
  snooze: "snooze",
  not_now: "not_now",
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const personId = url.searchParams.get("person");
  const action = url.searchParams.get("action") ?? "";

  if (!personId || !(action in ACTIONS)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  await digestEntryAction(id, personId, ACTIONS[action]);
  return NextResponse.redirect(new URL(`/digest?done=${action}`, url.origin));
}
