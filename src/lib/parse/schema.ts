import { z } from "zod";

/**
 * The strict JSON schema the parse call is constrained to. It mirrors the
 * people table so the confirm card can render straight from it.
 *
 * Every field except `name` is nullable: the parse must never block on a
 * missing field, and a bare name is a valid record.
 */

export const BirthdaySchema = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  // Many birthdays are known day and month only. Null, never a guess.
  year: z.number().int().min(1900).max(2100).nullable(),
});

export const ParsedTagSchema = z.object({
  name: z.string(),
  kind: z.enum(["context", "industry", "city", "strength"]).nullable(),
});

export const ParsedInteractionSchema = z.object({
  // Resolved against the capture date by the caller when the model returns a
  // relative phrase it could not date itself.
  occurred_on: z.string().nullable(),
  occurred_phrase: z.string().nullable(),
  channel: z.enum(["met", "call", "message", "email"]),
  summary: z.string().nullable(),
});

export const ParsedPersonSchema = z.object({
  name: z.string(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  city: z.string().nullable(),
  how_we_met: z.string().nullable(),
  notes: z.string().nullable(),
  birthday: BirthdaySchema.nullable(),
  introduced_by: z.string().nullable(),
  tags: z.array(ParsedTagSchema),
  interaction: ParsedInteractionSchema.nullable(),
});

/** A bulk paste — a badge dump, a list of names — yields several records. */
export const ParseResultSchema = z.object({
  people: z.array(ParsedPersonSchema),
});

export type Birthday = z.infer<typeof BirthdaySchema>;
export type ParsedTag = z.infer<typeof ParsedTagSchema>;
export type ParsedInteraction = z.infer<typeof ParsedInteractionSchema>;
export type ParsedPerson = z.infer<typeof ParsedPersonSchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;

export function emptyParsedPerson(name: string): ParsedPerson {
  return {
    name,
    company: null,
    role: null,
    city: null,
    how_we_met: null,
    notes: null,
    birthday: null,
    introduced_by: null,
    tags: [],
    interaction: null,
  };
}
