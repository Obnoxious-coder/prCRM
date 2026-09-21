import { NextResponse } from "next/server";

/**
 * Cron routes are unauthenticated unless CRON_SECRET is set, which keeps local
 * development frictionless and production locked down. Vercel Cron sends the
 * secret as a bearer token.
 */
export function authoriseCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  const header = request.headers.get("authorization");
  const query = new URL(request.url).searchParams.get("secret");
  if (header === `Bearer ${secret}` || query === secret) return null;
  return NextResponse.json({ error: "unauthorised" }, { status: 401 });
}
