# Personal CRM — Implementation Plan

Derived from `Personal CRM — Feature Spec.md`. Executed in the phase order the spec prescribes:
capture loop first, nudges later.

## Stated assumptions

The spec names Postgres (Supabase/Neon), Vercel cron, Resend, and an LLM parse call. This machine
has no `DATABASE_URL`, no `ANTHROPIC_API_KEY`, and no email provider key, so the build targets the
same architecture with locally-runnable substitutions:

| Spec | Built as | Why |
| --- | --- | --- |
| Postgres via Supabase/Neon | SQLite (`better-sqlite3`), Postgres-shaped relational schema | Runs with zero setup; schema/queries stay portable (uuid PKs, FKs, join table) |
| LLM parse with strict JSON schema | Anthropic SDK `messages.parse` + `zodOutputFormat`, **with a deterministic rule-based fallback** when no API key | App must work out of the box; fallback also serves as an offline/degraded path |
| Vercel cron nightly job | `/api/cron/nightly` route, callable by any scheduler | Same code, host-agnostic |
| Resend digest email | Digest rendered as HTML; sent via Resend if `RESEND_API_KEY` is set, otherwise written to `.digests/` and viewable at `/digest` | No key available |

Stack as built: Next.js 16.3.5 (App Router) + TypeScript + Tailwind v4 + SQLite.

**Provider update (mid-build, at the user's request):** the parse call now prefers
OpenRouter when `OPENROUTER_API_KEY` is set (`src/lib/parse/openrouter.ts`, strict
`json_schema` response format), falls back to the Anthropic SDK with
`messages.parse` + `zodOutputFormat` on `claude-opus-5`, and falls back again to the
deterministic rules. Set `OPENROUTER_MODEL` to choose the model behind it.

## Phase 1 — people + capture (spec: "add someone in under ten seconds")

- [x] Scaffold Next.js + TS + Tailwind; add `@anthropic-ai/sdk`, `zod`, `better-sqlite3`
- [x] Schema: `people`, `interactions`, `tags`, `people_tags`, `introductions`, plus
      `parse_logs` (spec's warning: log every raw input alongside its parsed output from day one)
      and `saved_views`, `digests`
- [x] Parser: zod schema mirroring the people table; Anthropic structured output; rule-based fallback
- [x] Parse edge cases: relative dates resolved against capture date, partial birthdays (null year),
      bulk paste splitting into several records, ambiguous-name candidate matching
- [x] Capture UI: one text box → confirm card with inline-editable fields → save.
      Name alone is valid; never block on a missing field
- [x] Person page: all fields, notes, tags, interactions, introduced-by line

## Phase 2 — interactions + quick-log

- [x] `POST /api/people/:id/interactions` writes interaction and denormalises `last_contacted_at`
- [x] Quick-log on the person page: one sentence → interaction, resets overdue clock
- [x] Channel inference (met / call / message / email) from the sentence

## Phase 3 — cadence, overdue job, digest

- [x] Cadence tiers (30/90/180/365/null), default 90, one-tap change on person page
- [x] `days_overdue = (today - last_contacted_at) - cadence_days`, falling back to `created_at`;
      `snoozed_until` in the future suppresses
- [x] Birthday lookahead: 14 days, day/month only, year wrap, Feb 29 → Mar 1 in non-leap years
- [x] Score: `days_overdue/cadence_days + 2*birthday_soon + 0.5*recently_added`
- [x] Dampening: no two consecutive digests (unless birthday), max one nudge / 30 days,
      dismissal snoozes for half the cadence
- [x] Digest composition: slots 1–2 birthdays, 3–4 top overdue, 5 wildcard (>1y, random);
      birthdays fall through to overdue when absent
- [x] Each entry: name, how we met, last interaction + date, one soft detail from notes
- [x] Actions per entry: log it / snooze / change cadence / not now
- [x] Open tracking → three unopened digests in a row drops cadence to fortnightly
- [x] `/api/cron/nightly` computes overdue; `/api/cron/digest` builds and delivers Monday digest

## Phase 4 — tags and saved views

- [x] Tag kinds: context / industry / city / strength; parser invents tags freely
- [x] Filter UI: tags (AND), city, overdue-by, last-contacted-before, untagged
- [x] Saved views: name any filter combination, pinned on the home screen
- [x] Tag cleanup view: merge near-duplicates

## Phase 5 — introductions and connectors

- [x] Introduction edges written at capture time from `introduced_by`
- [x] Connector ranking (introduction count desc) on the home screen
- [x] Orphans list (no introduction edge) — flagged for tighter cadence
- [x] Second-degree reach via shared tags on the person page
- [x] Reciprocity flag in the digest: introduced you to 3+, you've introduced them to none

## Verification

- [x] Unit tests for the pure logic: overdue maths, birthday wrap/Feb-29, scoring, dampening,
      digest composition, fallback parser (relative dates, partial birthdays, bulk paste)
- [x] Seed script with realistic data so the digest and connector views have something to show
- [x] `npm run build` clean; app boots and each phase's "done when" is demonstrable


---

## Outcome

All five phases shipped. 69 tests pass; `npm run build` is clean; every route was
smoke-tested against a seeded database, and the nudge → digest → action loop was
exercised end to end (digest built, delivered, opened-pixel recorded, snooze
applied, cadence halved).

**Two spec ambiguities resolved during the build**, both documented in the README
and at the code:

1. A birthday exempts a person from *both* dampening rules. The spec exempts
   birthdays only from the consecutive-digest rule, but consecutive digests are a
   week apart and the separate thirty-day cooldown would have swallowed the
   exemption whole — birthdays would never have been sent.
2. "Not now" deletes the nudge record instead of marking it shown, so the
   thirty-day cooldown doesn't charge the user for a nudge they declined. This is
   what makes "drops them from this week only" actually mean this week only.

**Two schema shapes differ from the spec table**, for reasons the spec itself
forces: birthdays are three columns rather than one nullable-year date (a SQL date
cannot express "day and month, year unknown", and the spec forbids guessing), and
`interactions` gained a `created_at` so same-day interactions keep a stable order.

Not built, because the spec explicitly deprioritised it: the visual relationship
graph ("a nice-to-have that looks impressive and gets used twice"). The ranked
connector list and the introduced-by line on each person's page are there instead,
which is what the spec asked for first.
