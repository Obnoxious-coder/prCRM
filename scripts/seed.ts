/**
 * Seeds a believable network so the digest, connector ranking and trip filters
 * have something to show. Safe to re-run: it clears the tables first.
 */
import { getDb } from "../src/lib/db";
import { addDays, todayISO } from "../src/lib/dates";
import { createPerson, logInteraction } from "../src/lib/people";
import { addIntroduction } from "../src/lib/graph";
import { saveView } from "../src/lib/views";
import type { ParsedPerson } from "../src/lib/parse/schema";
import type { Channel } from "../src/lib/types";

const today = todayISO();
const d = (daysAgo: number) => addDays(today, -daysAgo);

interface Seed {
  name: string;
  company?: string;
  role?: string;
  city?: string;
  how_we_met?: string;
  notes?: string;
  birthday?: [number, number, number | null];
  cadence: number | null;
  tags: [string, "context" | "industry" | "city" | "strength" | null][];
  addedDaysAgo: number;
  introducedBy?: string;
  interactions: [number, Channel, string][]; // [days ago, channel, summary]
}

const SEEDS: Seed[] = [
  {
    name: "Arjun Mehta", company: "Northwind Capital", role: "partner", city: "Bangalore",
    how_we_met: "a fintech dinner in 2021",
    notes: "Two daughters, both at the same school in Indiranagar. Cycles to work. Grew up in Kochi.",
    birthday: [11, 2, 1984], cadence: 30, addedDaysAgo: 900,
    tags: [["fintech", "industry"], ["investor", "context"], ["bangalore", "city"], ["close", "strength"]],
    interactions: [[12, "call", "Caught up on the fund's second close"], [70, "met", "Coffee at Third Wave"]],
  },
  {
    name: "Priya Raghavan", company: "a lending startup", role: "growth", city: "Bangalore",
    how_we_met: "the fintech meetup", introducedBy: "Arjun Mehta",
    notes: "Has a cat called Mango. Runs half marathons, badly, by her own account.",
    birthday: [9, 28, null], cadence: 90, addedDaysAgo: 20,
    tags: [["fintech", "industry"], ["meetup", "context"], ["bangalore", "city"], ["warm", "strength"]],
    interactions: [[20, "met", "Met at the fintech meetup, talked about their underwriting model"]],
  },
  {
    name: "Rohan Das", company: "Ledgerly", role: "founder", city: "Mumbai",
    how_we_met: "Arjun's demo day", introducedBy: "Arjun Mehta",
    notes: "Wife is a documentary editor. Obsessed with filter coffee. Moving to Mumbai from Pune last year.",
    birthday: [3, 14, 1990], cadence: 90, addedDaysAgo: 400,
    tags: [["fintech", "industry"], ["founder", "context"], ["mumbai", "city"]],
    interactions: [[210, "call", "Talked through their seed round"], [380, "met", "Demo day"]],
  },
  {
    name: "Sana Iqbal", company: "Studio Halcyon", role: "design lead", city: "Mumbai",
    how_we_met: "a design meetup", introducedBy: "Arjun Mehta",
    notes: "Plays bass in a covers band. Vegetarian. Keeps threatening to move to Lisbon.",
    cadence: 90, addedDaysAgo: 300,
    tags: [["design", "industry"], ["meetup", "context"], ["mumbai", "city"]],
    interactions: [[150, "message", "Sent her the portfolio site I liked"]],
  },
  {
    name: "Meera Nair", company: "Hark", role: "cofounder", city: "Bangalore",
    how_we_met: "we were colleagues at Zeta",
    notes: "Son started school this year. Climbs at Boulder Box on Tuesdays. From Thrissur originally.",
    birthday: [9, 25, 1988], cadence: 30, addedDaysAgo: 1200,
    tags: [["ex-colleague", "context"], ["saas", "industry"], ["bangalore", "city"], ["close", "strength"]],
    interactions: [[45, "met", "Dinner, talked about her cofounder situation"]],
  },
  {
    name: "Karan Shah", company: "Shah & Rao", role: "partner", city: "Mumbai",
    how_we_met: "a wedding in Jaipur", introducedBy: "Meera Nair",
    notes: "Collects fountain pens. Twin boys. Cooks Gujarati food seriously well.",
    cadence: 180, addedDaysAgo: 700,
    tags: [["legal", "industry"], ["wedding", "context"], ["mumbai", "city"]],
    interactions: [[260, "email", "Asked him about the contractor agreement"]],
  },
  {
    name: "Devika Menon", company: "Frame", role: "product designer", city: "Bangalore",
    how_we_met: "a design meetup, met cold",
    notes: "Rescued a three-legged dog called Idli. Studied architecture before switching.",
    birthday: [10, 1, null], cadence: 90, addedDaysAgo: 130,
    tags: [["design", "industry"], ["meetup", "context"], ["bangalore", "city"]],
    interactions: [[130, "met", "Met at the design meetup, she showed me the Frame beta"]],
  },
  {
    name: "Imran Qureshi", company: "Talos Security", role: "engineer", city: "Dubai",
    how_we_met: "a security conference",
    notes: "Married, one kid on the way. Into desert camping. Was at Cloudflare before.",
    cadence: 180, addedDaysAgo: 500,
    tags: [["security", "industry"], ["conference", "context"], ["dubai", "city"]],
    interactions: [[420, "met", "Conference in Dubai, long conversation about zero trust"]],
  },
  {
    name: "Ananya Bose", company: "Verdant", role: "climate analyst", city: "Delhi",
    how_we_met: "a panel I spoke on", introducedBy: "Meera Nair",
    notes: "Grew up in Shillong. Bakes sourdough. Husband teaches history.",
    birthday: [12, 30, 1992], cadence: 180, addedDaysAgo: 600,
    tags: [["climate", "industry"], ["conference", "context"], ["delhi", "city"]],
    interactions: [[500, "met", "Panel in Delhi"]],
  },
  {
    name: "Tobias Lind", company: "Norrsken", role: "investor", city: "Berlin",
    how_we_met: "a conference in Lisbon",
    notes: "Sails. Two kids. Splits his time between Berlin and Stockholm.",
    cadence: 365, addedDaysAgo: 800,
    tags: [["venture", "industry"], ["conference", "context"], ["berlin", "city"]],
    interactions: [[760, "met", "Lisbon conference, talked about European fintech"]],
  },
  {
    name: "Lakshmi Iyer", role: "recruiter", company: "Fold", city: "Bangalore",
    how_we_met: "she cold-emailed me about a role",
    notes: "Two cats, Dosa and Vada. Marathon runner. Kannada teacher on weekends.",
    cadence: 365, addedDaysAgo: 1000,
    tags: [["hiring", "industry"], ["bangalore", "city"], ["cold", "strength"]],
    interactions: [[600, "email", "She sent a JD for a product role"]],
  },
  {
    name: "Nikhil Verma", company: "Aureus", role: "CTO", city: "Hyderabad",
    how_we_met: "college", notes: "We shared a hostel room. Daughter turns four this year. Still plays cricket on Sundays.",
    birthday: [5, 18, 1987], cadence: 90, addedDaysAgo: 1500,
    tags: [["college", "context"], ["devtools", "industry"], ["hyderabad", "city"], ["close", "strength"]],
    interactions: [[200, "call", "Long call about his re-platforming project"]],
  },
];

function toParsed(s: Seed): ParsedPerson {
  return {
    name: s.name,
    company: s.company ?? null,
    role: s.role ?? null,
    city: s.city ?? null,
    how_we_met: s.how_we_met ?? null,
    notes: s.notes ?? null,
    birthday: s.birthday ? { month: s.birthday[0], day: s.birthday[1], year: s.birthday[2] } : null,
    introduced_by: null,
    tags: s.tags.map(([name, kind]) => ({ name, kind })),
    interaction: null,
  };
}

function main() {
  const db = getDb();
  db.exec(`DELETE FROM nudges; DELETE FROM digests; DELETE FROM introductions;
           DELETE FROM people_tags; DELETE FROM interactions; DELETE FROM saved_views;
           DELETE FROM tags; DELETE FROM people; DELETE FROM parse_logs;`);

  const ids = new Map<string, string>();
  for (const s of SEEDS) {
    const id = createPerson({ ...toParsed(s), cadence_days: s.cadence }, d(s.addedDaysAgo));
    ids.set(s.name, id);
  }

  for (const s of SEEDS) {
    const id = ids.get(s.name)!;
    for (const [daysAgo, channel, summary] of s.interactions) {
      logInteraction(id, { occurred_on: d(daysAgo), channel, summary });
    }
    if (s.introducedBy) {
      addIntroduction(id, ids.get(s.introducedBy)!, d(s.addedDaysAgo));
    }
  }

  saveView("Bangalore, most overdue first", { city: "Bangalore", sort: "overdue" });
  saveView("Fintech, quiet for six months", { tags: ["fintech"], quietForDays: 180 });
  saveView("Met cold", { orphansOnly: true, sort: "overdue" });

  const n = (db.prepare(`SELECT COUNT(*) AS n FROM people`).get() as { n: number }).n;
  const i = (db.prepare(`SELECT COUNT(*) AS n FROM interactions`).get() as { n: number }).n;
  console.log(`Seeded ${n} people, ${i} interactions, 3 saved views.`);
}

main();
