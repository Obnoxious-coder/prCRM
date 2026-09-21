"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { digestCadenceAction, digestEntryAction, sendDigestAction, type DigestOutcome } from "@/app/actions";
import { CADENCE_TIERS } from "@/lib/types";

export function SendDigest({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => startTransition(async () => { await sendDigestAction(); router.refresh(); })}
      className="bg-ink text-card rounded-lg px-3.5 py-1.5 text-sm font-medium disabled:opacity-40"
    >
      {pending ? "Building…" : label}
    </button>
  );
}

/** Log it · Snooze · Change cadence · Not now — the four actions per entry. */
export function EntryActions({
  digestId,
  personId,
  cadenceDays,
}: {
  digestId: string;
  personId: string;
  cadenceDays: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const act = (outcome: DigestOutcome) =>
    startTransition(async () => {
      await digestEntryAction(digestId, personId, outcome);
      router.refresh();
    });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <button
        disabled={pending}
        onClick={() => act("log")}
        className="bg-ink text-card rounded-md px-2.5 py-1 font-medium disabled:opacity-40"
      >
        Log it
      </button>
      <button disabled={pending} onClick={() => act("snooze")} className="text-ink-soft hover:text-ink px-1">
        Snooze
      </button>
      <select
        disabled={pending}
        value={String(cadenceDays)}
        onChange={(e) =>
          startTransition(async () => {
            const v = e.target.value;
            await digestCadenceAction(digestId, personId, v === "null" ? null : Number(v));
            router.refresh();
          })
        }
        className="border-line rounded-md border bg-transparent px-1.5 py-1"
        title="Change cadence"
      >
        {CADENCE_TIERS.map((t) => (
          <option key={t.label} value={String(t.days)}>
            {t.label}{t.days ? ` · ${t.days}d` : ""}
          </option>
        ))}
      </select>
      <button disabled={pending} onClick={() => act("not_now")} className="text-ink-soft hover:text-ink px-1">
        Not now
      </button>
    </div>
  );
}
