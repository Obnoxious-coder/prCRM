import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb, uuid } from "../db";
import { resolveRelativeDate, type ISODate } from "../dates";
import { fallbackParse } from "./fallback";
import { ParseResultSchema, type ParseResult } from "./schema";
import { openRouterConfigured, openRouterModel, parseWithOpenRouter } from "./openrouter";

/**
 * The parse step is where quality lives and where it breaks, so two things
 * matter here: a strict schema on the way out, and a log of every raw input
 * alongside its parsed output on the way in.
 */

const MODEL = "claude-opus-5";

const SYSTEM = `You turn one line of free text about a person into structured CRM fields.

Rules:
- Extract only what the text actually says. Never invent a company, city or role.
- \`name\` is the only field you must fill. Everything else is null when absent.
- \`notes\` carries the soft layer verbatim-ish: spouse, kids, pets, hobbies,
  where they grew up. This is the most valuable field — it is what makes a later
  follow-up feel personal. Keep the writer's own phrasing.
- \`how_we_met\` is the event, place or occasion, without the city (the city has
  its own field).
- Birthdays are frequently day and month only. Set \`year\` to null rather than
  guessing one.
- \`tags\` are invented freely; do not force a fixed vocabulary. Use \`kind\`
  "context" for how you know them, "industry" for their field, "city" for a
  place, "strength" for relationship temperature. Null kind is fine.
- \`interaction.occurred_on\` is an ISO date. If the text says something relative
  like "last Tuesday", put that phrase in \`occurred_phrase\` and leave
  \`occurred_on\` null — it is resolved against the capture date afterwards.
- A pasted list, a badge dump or several names means several entries in
  \`people\`. A single sentence about one person means exactly one.`;

export type ParseSource = "llm" | "fallback";
export type Provider = "openrouter" | "anthropic" | "rules";

export interface ParseOutcome {
  result: ParseResult;
  source: ParseSource;
  provider: Provider;
  model: string | null;
  logId: string;
  /** Set when the LLM path was tried and failed, so the UI can say so. */
  error: string | null;
}

/**
 * OpenRouter wins when configured, then a direct Anthropic key, then the
 * deterministic rules. The rules path is never an error state — it is the
 * offline mode.
 */
export function activeProvider(): Provider {
  if (openRouterConfigured()) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return "anthropic";
  return "rules";
}

export function activeModel(): string | null {
  const provider = activeProvider();
  if (provider === "openrouter") return openRouterModel();
  if (provider === "anthropic") return MODEL;
  return null;
}

export function hasLlmCredentials(): boolean {
  return activeProvider() !== "rules";
}

export async function parseCapture(input: string, captureDate: ISODate): Promise<ParseOutcome> {
  const started = Date.now();
  const provider = activeProvider();
  const userMessage = `Capture date: ${captureDate}\n\nText:\n${input}`;

  if (provider === "rules") {
    const result = fallbackParse(input, captureDate);
    return {
      result, source: "fallback", provider, model: null, error: null,
      logId: logParse(input, result, "fallback", null, Date.now() - started),
    };
  }

  try {
    const parsed =
      provider === "openrouter"
        ? await parseWithOpenRouter(SYSTEM, userMessage)
        : await parseWithAnthropic(userMessage);

    const result = resolveDates(parsed, captureDate);
    return {
      result, source: "llm", provider, model: activeModel(), error: null,
      logId: logParse(input, result, `llm:${provider}`, null, Date.now() - started),
    };
  } catch (error) {
    // Capture must never block. Fall back, but record what went wrong.
    const message = error instanceof Error ? error.message : String(error);
    const result = fallbackParse(input, captureDate);
    return {
      result, source: "fallback", provider: "rules", model: null, error: message,
      logId: logParse(input, result, "fallback", message, Date.now() - started),
    };
  }
}

async function parseWithAnthropic(userMessage: string): Promise<ParseResult> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(ParseResultSchema) },
    messages: [{ role: "user", content: userMessage }],
  });
  if (!response.parsed_output) throw new Error("parse returned no structured output");
  return response.parsed_output;
}

/** "Met her last Tuesday" resolves against the capture date, not today. */
function resolveDates(result: ParseResult, captureDate: ISODate): ParseResult {
  return {
    people: result.people.map((p) => {
      if (!p.interaction) return p;
      const { occurred_on, occurred_phrase } = p.interaction;
      const resolved =
        occurred_on ??
        (occurred_phrase ? resolveRelativeDate(occurred_phrase, captureDate) : null) ??
        captureDate;
      return { ...p, interaction: { ...p.interaction, occurred_on: resolved } };
    }),
  };
}

function logParse(
  raw: string,
  parsed: ParseResult | null,
  source: string,
  error: string | null,
  durationMs: number,
): string {
  const id = uuid();
  getDb()
    .prepare(
      `INSERT INTO parse_logs (id, raw_input, parsed_output, source, error, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, raw, parsed ? JSON.stringify(parsed) : null, source, error, durationMs, new Date().toISOString());
  return id;
}
