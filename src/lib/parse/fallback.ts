import { monthIndex, resolveRelativeDate, type ISODate } from "../dates";
import { emptyParsedPerson, type ParsedPerson, type ParsedTag, type ParseResult } from "./schema";

/**
 * A deterministic parser for the same job the LLM parse does.
 *
 * It runs whenever no API key is configured, and as the safety net when the
 * parse call fails — the spec is emphatic that capture must never block, and a
 * capture box that errors out is worse than one that extracts a little less.
 */

const EVENT_WORDS =
  "meetup|conference|summit|hackathon|workshop|party|wedding|dinner|lunch|coffee|demo day|offsite|retreat|standup|mixer|panel|launch|talk|event|fest|expo|class|course|gym|coworking";

const INDUSTRY_TAGS = [
  "fintech", "legal", "design", "hiring", "ai", "ml", "crypto", "web3", "saas",
  "healthcare", "health", "edtech", "climate", "biotech", "gaming", "media",
  "ecommerce", "logistics", "security", "devtools", "marketing", "growth",
  "recruiting", "venture", "consumer", "hardware", "robotics", "data",
];

const CONTEXT_TAGS = [
  "meetup", "conference", "summit", "hackathon", "college", "school",
  "university", "client", "investor", "founder", "wedding", "party",
  "ex-colleague", "colleague", "neighbour", "neighbor", "gym", "bootcamp",
];

const KNOWN_CITIES = [
  "Bangalore", "Bengaluru", "Mumbai", "Delhi", "Chennai", "Hyderabad", "Pune",
  "Kolkata", "Goa", "Jaipur", "Ahmedabad", "Kochi", "Dubai", "Abu Dhabi",
  "Singapore", "London", "Berlin", "Paris", "Amsterdam", "Lisbon", "Madrid",
  "Dublin", "Zurich", "Tokyo", "Seoul", "Sydney", "Melbourne", "Toronto",
  "Vancouver", "Austin", "Boston", "Chicago", "Denver", "Miami", "Seattle",
  "Nairobi", "Lagos", "Cairo", "Istanbul", "Tel Aviv", "Riyadh", "Doha",
  "New York", "San Francisco", "Los Angeles", "Sao Paulo", "Mexico City",
];

const SOFT_DETAIL_WORDS =
  "cat|dog|kid|kids|son|daughter|child|children|wife|husband|spouse|partner|" +
  "married|engaged|climbs|climbing|runs marathons|marathon|cycling|cycles|" +
  "plays|surf|surfs|cooks|baking|bakes|reads|hiking|hikes|chess|guitar|piano|" +
  "grew up|from originally|originally from|vegan|allergic|moving to|" +
  "birthday|loves|likes|into|obsessed with|collects|studied|sabbatical";

const NAME_STOPWORDS = new Set([
  "I", "We", "He", "She", "They", "Met", "Spoke", "Called", "Emailed", "Texted",
  "Had", "Saw", "Ran", "Introduced", "The", "A", "An", "At", "In", "On", "Via",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December", "Yesterday", "Today",
]);

export function fallbackParse(input: string, captureDate: ISODate): ParseResult {
  return { people: splitRecords(input).map((chunk) => parseOne(chunk, captureDate)) };
}

/**
 * A conference badge dump or a pasted list should become several records, not
 * one. Lines and bullets split; a single prose sentence does not.
 */
export function splitRecords(input: string): string[] {
  const lines = input
    .split(/\r?\n|(?:^|\s)[•*•]\s+|;\s*/)
    .map((l) => l.replace(/^\s*[-–—]\s+/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;

  const single = lines[0] ?? input.trim();
  // "Priya, Rahul and Meera from the design meetup" — a comma list of bare names.
  const names = single.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))+(?:\s*,?\s*and\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?))?\s*$/);
  if (names) {
    return single.split(/\s*,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  }
  return [single];
}

function parseOne(text: string, captureDate: ISODate): ParsedPerson {
  const p = emptyParsedPerson(extractName(text));
  const tags = new Map<string, ParsedTag>();

  p.city = extractCity(text);
  p.how_we_met = extractHowWeMet(text);
  p.introduced_by = extractIntroducedBy(text, p.name);

  const { role, company } = extractRoleAndCompany(text);
  p.role = role;
  p.company = company;

  p.birthday = extractBirthday(text);
  p.notes = extractNotes(text);

  for (const t of extractTags(text, p.city)) tags.set(t.name, t);
  p.tags = [...tags.values()];

  p.interaction = {
    occurred_on: resolveRelativeDate(text, captureDate) ?? captureDate,
    occurred_phrase: null,
    channel: extractChannel(text),
    summary: text.trim(),
  };

  return p;
}

function extractName(text: string): string {
  // "met Priya at ..." / "call with Dr. Rao" — the name follows the verb.
  const afterVerb = text.match(
    /\b(?:met|meeting|spoke (?:to|with)|call(?:ed)? with|called|caught up with|coffee with|lunch with|dinner with|intro(?:duced)? to|emailed|texted|messaged|drinks with)\s+((?:[A-Z][\w'’-]*\.?\s*){1,3})/,
  );
  const candidate = afterVerb?.[1]?.trim();
  if (candidate) {
    const cleaned = trimTrailingStopword(candidate);
    if (cleaned) return cleaned;
  }

  // Otherwise the first capitalised run that isn't a weekday, month or filler.
  const words = text.match(/[A-Z][\w'’-]*/g) ?? [];
  const start = words.findIndex((w) => !NAME_STOPWORDS.has(w));
  if (start >= 0) {
    const run = [words[start]];
    const after = text.slice(text.indexOf(words[start]) + words[start].length);
    const next = after.match(/^\s+([A-Z][\w'’-]+)/);
    if (next && !NAME_STOPWORDS.has(next[1]) && !KNOWN_CITIES.includes(next[1])) {
      run.push(next[1]);
    }
    return run.join(" ");
  }

  return text.trim().split(/\s+/).slice(0, 2).join(" ") || "Unnamed";
}

function trimTrailingStopword(candidate: string): string | null {
  const parts = candidate.split(/\s+/).filter(Boolean);
  while (parts.length && NAME_STOPWORDS.has(parts[parts.length - 1])) parts.pop();
  return parts.length ? parts.join(" ") : null;
}

function extractCity(text: string): string | null {
  for (const city of KNOWN_CITIES) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) return city;
  }
  const m = text.match(/\b(?:in|from|based in|lives in|moved to)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/);
  return m ? m[1] : null;
}

function extractHowWeMet(text: string): string | null {
  const m = text.match(new RegExp(`\\b(?:at|during|after)\\s+((?:the\\s+)?[\\w'’\\- ]*?(?:${EVENT_WORDS})\\b[\\w'’\\- ]*)`, "i"));
  if (m) return stripCityFromPhrase(m[1].trim(), extractCity(text));
  const via = text.match(/\b(?:through|via)\s+([\w'’\- ]{3,40})/i);
  if (via) return via[1].trim();
  return null;
}

/** "the Bangalore fintech meetup" reads better as "the fintech meetup" once city is its own field. */
function stripCityFromPhrase(phrase: string, city: string | null): string {
  if (!city) return phrase;
  return phrase.replace(new RegExp(`\\b${city}\\b\\s*`, "i"), "").replace(/\s{2,}/g, " ").trim();
}

function extractIntroducedBy(text: string, name: string): string | null {
  const patterns = [
    /\b([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)\s+(?:introduced|connected|put me onto|intro'?d)\s+(?:us|me|them)\b/,
    /\b(?:introduced|connected|intro'?d)\s+(?:to (?:her|him|them|me) )?(?:by|through|via)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/i,
    /\b(?:intro|introduction)\s+(?:from|by|via)\s+([A-Z][\w'’-]+(?:\s+[A-Z][\w'’-]+)?)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && m[1] !== name) return m[1].trim();
  }
  return null;
}

function extractRoleAndCompany(text: string): { role: string | null; company: string | null } {
  // "runs growth at a lending startup" / "heads design at Acme"
  const runsAt = text.match(/\b(?:runs|heads|leads|does|manages|owns)\s+([\w'’\- ]{2,30}?)\s+at\s+([\w'’\-&. ]{2,40}?)(?=[,.]|$| and | who | she | he | they )/i);
  if (runsAt) return { role: runsAt[1].trim(), company: runsAt[2].trim() };

  // "VP of engineering at Acme" / "designer at Acme" / "works at Acme as a PM"
  const roleAt = text.match(/\b((?:[\w'’-]+\s+){0,3}(?:engineer|developer|designer|founder|cofounder|co-founder|ceo|cto|coo|cfo|vp|head|director|manager|lead|analyst|scientist|researcher|partner|associate|consultant|marketer|recruiter|pm|product manager|architect|advisor|investor))\s+(?:at|for|with)\s+([\w'’\-&. ]{2,40}?)(?=[,.]|$| and | who | she | he | they )/i);
  if (roleAt) return { role: roleAt[1].trim(), company: roleAt[2].trim() };

  const worksAt = text.match(/\b(?:works|working|consults)\s+(?:at|for|with)\s+([\w'’\-&. ]{2,40}?)(?=[,.]|$| and | who | she | he | they )/i);
  const asRole = text.match(/\bas\s+(?:an?\s+)?([\w'’\- ]{2,30}?)(?=[,.]|$| at | and )/i);
  if (worksAt) return { role: asRole ? asRole[1].trim() : null, company: worksAt[1].trim() };

  // "runs a lending startup" with no separate role.
  const runs = text.match(/\b(?:runs|founded|started)\s+((?:an?|the)\s+[\w'’\- ]{2,40}?)(?=[,.]|$| and | who )/i);
  if (runs) return { role: null, company: runs[1].trim() };

  return { role: asRole ? asRole[1].trim() : null, company: null };
}

function extractBirthday(text: string) {
  const m = text.match(/\b(?:birthday|bday|born)\s*(?:is|on|:)?\s*(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-zA-Z]{3,9})\.?(?:\s*,?\s*(\d{4}))?/);
  if (m) {
    const month = monthIndex(m[2]);
    if (month) return { month, day: parseInt(m[1], 10), year: m[3] ? parseInt(m[3], 10) : null };
  }
  const m2 = text.match(/\b(?:birthday|bday|born)\s*(?:is|on|:)?\s*([a-zA-Z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/);
  if (m2) {
    const month = monthIndex(m2[1]);
    if (month) return { month, day: parseInt(m2[2], 10), year: m2[3] ? parseInt(m2[3], 10) : null };
  }
  return null;
}

/**
 * The soft layer — spouse, kids, pets, hobbies. Kept as the clauses they were
 * written in, because the phrasing is half of what makes a follow-up personal.
 */
function extractNotes(text: string): string | null {
  const clauses = text.split(/,|(?:\band\b)|\.(?:\s|$)/).map((c) => c.trim()).filter(Boolean);
  const soft = clauses.filter((c) => new RegExp(`\\b(?:${SOFT_DETAIL_WORDS})\\b`, "i").test(c));
  if (!soft.length) return null;
  return soft
    .map((c) => c.replace(/^(?:she|he|they|who)\s+/i, "").replace(/^has\s+/i, "the ").trim())
    .join("; ");
}

function extractTags(text: string, city: string | null): ParsedTag[] {
  const t = text.toLowerCase();
  const out: ParsedTag[] = [];
  for (const tag of INDUSTRY_TAGS) {
    if (new RegExp(`\\b${tag}\\b`).test(t)) out.push({ name: tag, kind: "industry" });
  }
  for (const tag of CONTEXT_TAGS) {
    if (new RegExp(`\\b${tag}\\b`).test(t)) out.push({ name: tag, kind: "context" });
  }
  if (city) out.push({ name: city.toLowerCase(), kind: "city" });
  // Explicit #hashtags always win.
  for (const m of text.matchAll(/#([\w-]+)/g)) out.push({ name: m[1].toLowerCase(), kind: null });
  return out;
}

function extractChannel(text: string): "met" | "call" | "message" | "email" {
  // Match on the earliest verb in the sentence. "has a cat called Mango"
  // contains "called", but the capture is still a meeting.
  const patterns: [RegExp, "met" | "call" | "message" | "email"][] = [
    [/\b(?:met|meeting|caught up with|coffee with|lunch with|dinner with|drinks with|ran into|saw)\b/i, "met"],
    [/\b(?:called|call with|phoned|rang|zoom|hopped on a call|spoke to|spoke with|talked to)\b/i, "call"],
    [/\b(?:texted|messaged|whatsapp|dm'?d|pinged|slacked)\b/i, "message"],
    [/\b(?:emailed|sent (?:her|him|them) an? (?:mail|email)|replied to)\b/i, "email"],
  ];
  let best: { index: number; channel: "met" | "call" | "message" | "email" } | null = null;
  for (const [re, channel] of patterns) {
    const m = text.match(re);
    if (m?.index !== undefined && (best === null || m.index < best.index)) {
      best = { index: m.index, channel };
    }
  }
  return best?.channel ?? "met";
}
