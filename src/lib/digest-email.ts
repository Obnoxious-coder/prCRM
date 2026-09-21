import fs from "node:fs";
import path from "node:path";
import { formatDate, relativeLabel, type ISODate } from "./dates";
import { entryReason, type DigestEntry } from "./digest";

/** Plain HTML, no template framework. Email clients are not a place to be clever. */

export function renderDigestHtml(
  entries: DigestEntry[],
  sentOn: ISODate,
  digestId: string,
  baseUrl: string,
): string {
  const rows = entries.map((e, i) => entryHtml(e, i + 1, sentOn, digestId, baseUrl)).join("\n");
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your week — ${formatDate(sentOn)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f6f5f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1a17;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:0 4px 20px;">
      <div style="font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8a8279;">Personal CRM · ${formatDate(sentOn)}</div>
      <div style="font-size:24px;font-weight:600;margin-top:6px;">Five people worth a message</div>
      <div style="font-size:14px;color:#6f6862;margin-top:6px;line-height:1.5;">One decision point this week. Log it, snooze it, or let it go.</div>
    </td></tr>
    ${rows || emptyStateHtml()}
    <tr><td style="padding:18px 4px 0;font-size:12px;color:#9a938b;line-height:1.6;">
      <a href="${baseUrl}/digest" style="color:#6f6862;">See this in the app</a> ·
      <a href="${baseUrl}/settings" style="color:#6f6862;">Change how often you get this</a>
    </td></tr>
  </table>
  <img src="${baseUrl}/api/digest/${digestId}/open" width="1" height="1" alt="" style="display:block;">
</body>
</html>`;
}

function entryHtml(e: DigestEntry, index: number, sentOn: ISODate, digestId: string, baseUrl: string): string {
  const act = (action: string) =>
    `${baseUrl}/api/digest/${digestId}/act?person=${e.person.id}&action=${action}`;

  const meta = [
    e.person.role && e.person.company ? `${e.person.role} at ${e.person.company}` : e.person.company || e.person.role,
    e.person.city,
  ].filter(Boolean).join(" · ");

  const last = e.last_interaction
    ? `${e.last_interaction.summary ?? e.last_interaction.channel} — ${relativeLabel(e.last_interaction.occurred_on, sentOn)} (${formatDate(e.last_interaction.occurred_on)})`
    : "No interaction logged yet";

  return `<tr><td style="padding:0 0 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdfa;border:1px solid #e7e2da;border-radius:12px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${slotColour(e.slot)};font-weight:600;">${index}. ${escapeHtml(entryReason(e))}</div>
        <div style="font-size:18px;font-weight:600;margin-top:7px;"><a href="${baseUrl}/people/${e.person.id}" style="color:#1c1a17;text-decoration:none;">${escapeHtml(e.person.name)}</a></div>
        ${meta ? `<div style="font-size:13px;color:#6f6862;margin-top:2px;">${escapeHtml(meta)}</div>` : ""}
        ${e.person.how_we_met ? `<div style="font-size:13px;color:#6f6862;margin-top:8px;">Met: ${escapeHtml(e.person.how_we_met)}</div>` : ""}
        <div style="font-size:13px;color:#6f6862;margin-top:4px;">Last: ${escapeHtml(last)}</div>
        ${e.soft_detail ? `<div style="font-size:14px;color:#1c1a17;margin-top:10px;padding:10px 12px;background:#f4f1ea;border-radius:8px;line-height:1.5;">${escapeHtml(e.soft_detail)}</div>` : ""}
        ${e.reciprocity_flag ? `<div style="font-size:12px;color:#8a5a20;margin-top:8px;">${escapeHtml(e.reciprocity_flag)}</div>` : ""}
        <div style="margin-top:14px;font-size:13px;">
          <a href="${act("log")}" style="display:inline-block;padding:7px 14px;background:#1c1a17;color:#fffdfa;border-radius:7px;text-decoration:none;">Log it</a>
          <a href="${act("snooze")}" style="display:inline-block;padding:7px 12px;color:#6f6862;text-decoration:none;">Snooze</a>
          <a href="${baseUrl}/people/${e.person.id}#cadence" style="display:inline-block;padding:7px 12px;color:#6f6862;text-decoration:none;">Change cadence</a>
          <a href="${act("not_now")}" style="display:inline-block;padding:7px 12px;color:#6f6862;text-decoration:none;">Not now</a>
        </div>
      </td></tr>
    </table>
  </td></tr>`;
}

function emptyStateHtml(): string {
  return `<tr><td style="padding:20px;background:#fffdfa;border:1px solid #e7e2da;border-radius:12px;font-size:14px;color:#6f6862;">
    Nobody is overdue this week. Enjoy it.
  </td></tr>`;
}

function slotColour(slot: DigestEntry["slot"]): string {
  return slot === "birthday" ? "#a2521f" : slot === "wildcard" ? "#4a6b57" : "#6f6862";
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface DeliveryResult {
  delivery: "resend" | "file";
  detail: string;
}

/**
 * Resend when a key is configured; otherwise the digest is written to
 * `.digests/` and stays readable at /digest. Delivery failing must never lose
 * the digest itself.
 */
export async function deliverDigest(
  html: string,
  subject: string,
  to: string | null,
  sentOn: ISODate,
): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY;
  if (key && to) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.DIGEST_FROM ?? "Personal CRM <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (res.ok) return { delivery: "resend", detail: `emailed to ${to}` };
    return { delivery: "file", detail: `Resend failed (${res.status}); written to disk instead` };
  }

  const dir = path.join(process.cwd(), ".digests");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${sentOn}.html`);
  fs.writeFileSync(file, html, "utf8");
  return { delivery: "file", detail: `written to ${path.relative(process.cwd(), file)}` };
}
