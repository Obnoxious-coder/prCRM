import { z } from "zod";
import { ParseResultSchema, type ParseResult } from "./schema";

/**
 * OpenRouter path for the parse call. OpenRouter speaks the OpenAI chat
 * completions shape, so this is a plain fetch with a strict `json_schema`
 * response format rather than an SDK.
 *
 * Set OPENROUTER_API_KEY to use it, and OPENROUTER_MODEL to pick the model
 * behind it (any slug OpenRouter lists).
 */

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4.5";

export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export function openRouterModel(): string {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
}

export async function parseWithOpenRouter(
  system: string,
  user: string,
): Promise<ParseResult> {
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      // OpenRouter uses these for attribution on its dashboard; both optional.
      "HTTP-Referer": process.env.OPENROUTER_SITE_URL ?? "http://localhost:3000",
      "X-Title": "Personal CRM",
    },
    body: JSON.stringify({
      model: openRouterModel(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "capture_parse",
          strict: true,
          schema: z.toJSONSchema(ParseResultSchema, { target: "draft-7" }),
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (body.error) throw new Error(`OpenRouter: ${body.error.message ?? "unknown error"}`);

  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter returned no content");

  return ParseResultSchema.parse(JSON.parse(stripCodeFence(content)));
}

/** Some models wrap JSON in a fence even under a schema constraint. */
function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
