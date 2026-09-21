"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteInteractionAction, quickLogAction, setCadenceAction, setIntroducerAction,
  snoozeAction, unsnoozeAction, updatePersonAction,
} from "@/app/actions";
import { CADENCE_TIERS, type Person, type Tag } from "@/lib/types";

/** Quick-log: open a person, tap Log, type a sentence, done. */
export function QuickLog({ personId }: { personId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-ink text-card rounded-lg px-3.5 py-1.5 text-sm font-medium"
      >
        Log
      </button>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await quickLogAction(personId, formData);
          setOpen(false);
          router.refresh();
        })
      }
      className="card w-full p-3"
    >
      <textarea
        name="summary"
        autoFocus
        rows={2}
        placeholder="called about the new role, she's staying put for now"
        className="placeholder:text-ink-faint/70 w-full resize-none bg-transparent text-sm outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <select name="channel" className="border-line rounded-md border bg-transparent px-2 py-1">
          <option value="">Channel from the text</option>
          <option value="met">Met</option>
          <option value="call">Call</option>
          <option value="message">Message</option>
          <option value="email">Email</option>
        </select>
        <input
          type="date"
          name="occurred_on"
          className="border-line rounded-md border bg-transparent px-2 py-1"
          title="Leave empty to read the date from the sentence"
        />
        <button
          disabled={pending}
          className="bg-ink text-card rounded-md px-3 py-1 font-medium disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-soft">
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Cadence, changeable from the person's page in one tap. */
export function CadencePicker({ person }: { person: Person }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div id="cadence" className="flex flex-wrap items-center gap-1.5">
      {CADENCE_TIERS.map((tier) => {
        const active = person.cadence_days === tier.days;
        return (
          <button
            key={tier.label}
            title={tier.who}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await setCadenceAction(person.id, tier.days);
                router.refresh();
              })
            }
            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
              active ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:border-ink/25"
            }`}
          >
            {tier.label}
            {tier.days ? <span className="opacity-60"> · {tier.days}d</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function SnoozeControls({ person }: { person: Person }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  if (person.snoozed_until) {
    return (
      <button
        disabled={pending}
        onClick={() => run(() => unsnoozeAction(person.id))}
        className="text-ink-soft hover:text-ink text-xs underline"
      >
        Snoozed until {person.snoozed_until} — un-snooze
      </button>
    );
  }
  return (
    <button
      disabled={pending}
      onClick={() => run(() => snoozeAction(person.id))}
      className="text-ink-soft hover:text-ink text-xs underline"
    >
      Snooze half a cadence
    </button>
  );
}

export function EditPerson({ person, tags }: { person: Person; tags: Tag[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-ink-soft hover:text-ink text-xs underline">
        Edit details
      </button>
    );
  }

  const birthday =
    person.birthday_month && person.birthday_day
      ? person.birthday_year
        ? `${person.birthday_year}-${pad(person.birthday_month)}-${pad(person.birthday_day)}`
        : `${pad(person.birthday_month)}-${pad(person.birthday_day)}`
      : "";

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          await updatePersonAction(person.id, formData);
          setOpen(false);
          router.refresh();
        })
      }
      className="card mt-3 grid gap-3 p-4 sm:grid-cols-2"
    >
      <Input name="name" label="Name" defaultValue={person.name} />
      <Input name="role" label="Role" defaultValue={person.role ?? ""} />
      <Input name="company" label="Company" defaultValue={person.company ?? ""} />
      <Input name="city" label="City" defaultValue={person.city ?? ""} />
      <Input name="how_we_met" label="How we met" defaultValue={person.how_we_met ?? ""} />
      <Input
        name="birthday"
        label="Birthday (MM-DD, or YYYY-MM-DD)"
        defaultValue={birthday}
        placeholder="03-14"
      />
      <label className="sm:col-span-2">
        <span className="label-xs">Notes</span>
        <textarea
          name="notes"
          defaultValue={person.notes ?? ""}
          rows={4}
          className="border-line focus:border-ink/30 mt-1 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
        />
      </label>
      <Input
        name="tags"
        label="Tags (comma separated)"
        defaultValue={tags.map((t) => t.name).join(", ")}
        className="sm:col-span-2"
      />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="bg-ink text-card rounded-lg px-3.5 py-1.5 text-sm disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-ink-soft text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function IntroducerPicker({
  personId,
  current,
  candidates,
}: {
  personId: string;
  current: string | null;
  candidates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      disabled={pending}
      value={current ?? ""}
      onChange={(e) =>
        startTransition(async () => {
          await setIntroducerAction(personId, e.target.value || null);
          router.refresh();
        })
      }
      className="border-line rounded-md border bg-transparent px-2 py-0.5 text-xs"
    >
      <option value="">Met cold — nobody introduced us</option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function DeleteInteraction({ personId, interactionId }: { personId: string; interactionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deleteInteractionAction(personId, interactionId);
          router.refresh();
        })
      }
      className="text-ink-faint hover:text-overdue text-xs"
      title="Delete this interaction"
    >
      ×
    </button>
  );
}

function Input({
  name,
  label,
  defaultValue,
  placeholder,
  className = "",
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="label-xs">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="border-line focus:border-ink/30 mt-1 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
      />
    </label>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
