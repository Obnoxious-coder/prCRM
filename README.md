# Personal CRM

A personal CRM for remembering people properly and staying in touch deliberately
rather than by accident. Built from `Personal CRM — Feature Spec.md`.

Three jobs: **capture** someone in seconds, **recall** everything before a call,
**nudge** you before a relationship quietly lapses.

## Running it

```bash
npm install
npm run seed     # optional: twelve people with history, so the digest has something to say
npm run dev      # http://localhost:3000
```

No API keys and no database server are needed to run it. See *Configuration* below
for what each key adds.

```bash
npm test         # 69 tests over the date maths, scoring, dampening, parsing and capture
npm run build
```

## What's here

| | |
| --- | --- |
| `/` | Capture box, saved views, this week's five, connectors, most overdue |
| `/people` | Filter by tag, city, recency, overdue, untagged, met-cold; save any combination as a view |
| `/people/[id]` | Everything known about someone, quick-log, cadence in one tap, second-degree reach |
| `/digest` | The sent digest with its four actions, plus a live preview of the next one |
| `/network` | Connector ranking, favours to return, introductions you could make, orphans |
| `/tags` | Tag kinds and near-duplicate merging |
| `/settings` | Delivery, parse provider, and the raw parse log |
| `/api/cron/nightly` | Recomputes contact dates, clears lapsed snoozes, reports the overdue queue |
| `/api/cron/digest` | Builds and delivers the Monday digest; no-ops unless one is due |

## Configuration

Copy `.env.example` to `.env.local`. Everything in it is optional.

**Parse.** The capture box turns one sentence into fields. It uses OpenRouter if
`OPENROUTER_API_KEY` is set, Anthropic if `ANTHROPIC_API_KEY` is set, and a
deterministic rule-based parser otherwise. The rules path is not an error state —
it handles the spec's worked example, relative dates, partial birthdays and bulk
pastes, just with thinner extraction on unusual phrasing. It is also the fallback
when a model call fails, because capture must never block.

Every raw input is logged alongside its parsed output in `parse_logs`, visible at
`/settings` — when the parse gets something wrong you can see exactly what it saw.

**Digest.** With `RESEND_API_KEY` and an address in settings, the Monday digest is
emailed. Without them it is written to `.digests/` and rendered at `/digest`.

**Cron.** Point any scheduler at the two cron routes; `vercel.json` has them wired
for Vercel Cron. Setting `CRON_SECRET` requires `Authorization: Bearer $CRON_SECRET`.

## Deviations from the spec

The spec calls for Postgres (Supabase/Neon), a Vercel cron and Resend. This
implementation keeps that architecture but substitutes what can run with no setup:

- **SQLite instead of Postgres.** The schema is Postgres-shaped — uuid primary
  keys, real foreign keys, a join table for tags, a directed edge list for
  introductions — so the queries port over when a `DATABASE_URL` appears. Swapping
  the driver means rewriting `src/lib/db.ts` and nothing else.
- **Birthdays are stored as three columns** (`birthday_month`, `birthday_day`,
  `birthday_year`) rather than a nullable-year date, because "day and month, year
  unknown" is not expressible as a SQL date and the spec is explicit that the year
  must not be guessed.
- **`interactions.created_at`** was added so two interactions logged on the same
  date still have a stable order.

Two rules in the spec pull against each other, and the resolution is documented
where it lives:

- A birthday exempts someone from **both** dampening rules, not just the
  consecutive-digest one. Consecutive digests are a week apart, so the thirty-day
  cooldown would otherwise swallow the exemption entirely and a birthday would go
  unsent (`src/lib/nudge.ts`).
- **"Not now"** deletes the nudge record rather than marking it shown, so the
  thirty-day cooldown doesn't penalise a nudge the user explicitly declined to act
  on. It drops them from this week only, as the spec says (`src/app/actions.ts`).

## Layout

```
src/lib/
  db.ts            schema and connection
  dates.ts         ISO-date arithmetic, birthday wrap, relative-date resolution
  parse/           schema.ts (strict zod) · fallback.ts (rules) · openrouter.ts · index.ts
  capture.ts       parse → draft → saved record, including the ambiguous-name path
  people.ts        people and interactions, last_contacted_at denormalisation
  nudge.ts         overdue, scoring, dampening — all pure above the fold
  digest.ts        composition and slots ·  digest-email.ts renders and delivers
  graph.ts         connectors, orphans, second-degree reach, reciprocity
  filters.ts       filter shapes (client-safe) · views.ts the queries behind them
```

The pure logic — dates, scoring, dampening, composition, the rule parser — is
separated from the database deliberately, and that is what the test suite covers.
