import type { ISODate } from "./dates";

export type TagKind = "context" | "industry" | "city" | "strength";
export const TAG_KINDS: TagKind[] = ["context", "industry", "city", "strength"];

export type Channel = "met" | "call" | "message" | "email";
export const CHANNELS: Channel[] = ["met", "call", "message", "email"];

export interface Person {
  id: string;
  name: string;
  how_we_met: string | null;
  company: string | null;
  role: string | null;
  city: string | null;
  birthday_month: number | null;
  birthday_day: number | null;
  birthday_year: number | null;
  cadence_days: number | null;
  notes: string | null;
  last_contacted_at: ISODate | null;
  snoozed_until: ISODate | null;
  created_at: string;
}

export interface Interaction {
  id: string;
  person_id: string;
  occurred_on: ISODate;
  channel: Channel;
  summary: string | null;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  kind: TagKind | null;
}

export interface SavedView {
  id: string;
  name: string;
  filters: string;
  created_at: string;
}

/** The cadence tiers the spec suggests. New contacts default to Active. */
export const CADENCE_TIERS = [
  { label: "Close", days: 30, who: "Close friends, key collaborators" },
  { label: "Active", days: 90, who: "People you want to keep warm" },
  { label: "Loose", days: 180, who: "Good contacts, low frequency" },
  { label: "Dormant", days: 365, who: "Annual check-in only" },
  { label: "None", days: null, who: "Never nudge" },
] as const;

export const DEFAULT_CADENCE_DAYS = 90;

export function cadenceLabel(days: number | null): string {
  return CADENCE_TIERS.find((t) => t.days === days)?.label ?? `${days} days`;
}
