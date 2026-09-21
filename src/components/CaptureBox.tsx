"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { commitCaptureAction, parseCaptureAction, type ParseActionResult } from "@/app/actions";
import type { DraftPerson } from "@/lib/capture";
import type { ParsedPerson } from "@/lib/parse/schema";
import { CADENCE_TIERS, DEFAULT_CADENCE_DAYS } from "@/lib/types";

/**
 * One text box, no form. Type a sentence, get a compact card with the extracted
 * fields editable inline, one tap to save.
 */

interface DraftState extends DraftPerson {
  cadenceDays: number | null;
  target: "new" | string;
}

const PLACEHOLDER =
  "met Priya at the Bangalore fintech meetup, she runs growth at a lending startup, has a cat called Mango, Arjun introduced us";

export function CaptureBox({ providerLabel }: { providerLabel: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftState[] | null>(null);
  const [meta, setMeta] = useState<ParseActionResult | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLTextAreaElement>(null);

  function parse() {
    if (!text.trim()) return;
    setSaved(null);
    startTransition(async () => {
      const result = await parseCaptureAction(text);
      setMeta(result);
      setDrafts(
        result.drafts.map((d) => ({
          ...d,
          target: d.suggestion,
          cadenceDays: DEFAULT_CADENCE_DAYS,
        })),
      );
    });
  }

  function save() {
    if (!drafts?.length) return;
    startTransition(async () => {
      const { personIds } = await commitCaptureAction(
        drafts.map((d) => ({ parsed: d.parsed, target: d.target, cadenceDays: d.cadenceDays })),
      );
      setSaved(
        personIds.length === 1
          ? `Saved ${drafts[0].parsed.name}.`
          : `Saved ${personIds.length} people.`,
      );
      setText("");
      setDrafts(null);
      setMeta(null);
      router.refresh();
      boxRef.current?.focus();
    });
  }

  function patch(index: number, changes: Partial<ParsedPerson>) {
    setDrafts((current) =>
      current?.map((d, i) => (i === index ? { ...d, parsed: { ...d.parsed, ...changes } } : d)) ?? null,
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="p-4 sm:p-5">
        <label htmlFor="capture" className="label-xs">
          Capture
        </label>
        <textarea
          id="capture"
          ref={boxRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") parse();
          }}
          rows={2}
          placeholder={PLACEHOLDER}
          className="placeholder:text-ink-faint/70 mt-2 w-full resize-none bg-transparent text-[1.0625rem] leading-relaxed outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={parse}
            disabled={pending || !text.trim()}
            className="bg-ink text-card rounded-lg px-4 py-1.5 text-sm font-medium transition-opacity disabled:opacity-35"
          >
            {pending && !drafts ? "Reading…" : "Parse"}
          </button>
          <span className="text-ink-faint text-xs">⌘↵ · {providerLabel}</span>
          {saved && <span className="text-accent text-xs font-medium">{saved}</span>}
        </div>
      </div>

      {drafts && (
        <div className="border-line bg-paper/60 border-t p-4 sm:p-5">
          {meta?.usedFallback && (
            <p className="text-ink-soft mb-3 text-xs leading-relaxed">
              {meta.error
                ? `The model call failed (${meta.error}) — these fields came from the built-in rules instead. Nothing is lost; edit anything that's wrong.`
                : "Parsed with the built-in rules — no model key configured. Edit anything that's wrong."}
            </p>
          )}
          {drafts.length === 0 && <p className="text-ink-soft text-sm">Nothing to save.</p>}
          <div className="space-y-3">
            {drafts.map((draft, i) => (
              <DraftCard
                key={i}
                draft={draft}
                onPatch={(changes) => patch(i, changes)}
                onTarget={(target) =>
                  setDrafts((c) => c?.map((d, j) => (j === i ? { ...d, target } : d)) ?? null)
                }
                onCadence={(cadenceDays) =>
                  setDrafts((c) => c?.map((d, j) => (j === i ? { ...d, cadenceDays } : d)) ?? null)
                }
              />
            ))}
          </div>
          {drafts.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={save}
                disabled={pending}
                className="bg-ink text-card rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-40"
              >
                {pending ? "Saving…" : drafts.length > 1 ? `Save ${drafts.length} people` : "Save"}
              </button>
              <button
                onClick={() => { setDrafts(null); setMeta(null); }}
                className="text-ink-soft hover:text-ink text-sm"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DraftCard({
  draft,
  onPatch,
  onTarget,
  onCadence,
}: {
  draft: DraftState;
  onPatch: (changes: Partial<ParsedPerson>) => void;
  onTarget: (target: "new" | string) => void;
  onCadence: (days: number | null) => void;
}) {
  const p = draft.parsed;
  const merging = draft.target !== "new";

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Field
          value={p.name}
          onChange={(name) => onPatch({ name: name ?? "" })}
          className="font-serif min-w-32 text-xl"
          placeholder="Name"
        />
        {p.birthday && (
          <span className="text-ink-faint text-xs">
            b. {p.birthday.day}/{p.birthday.month}
            {p.birthday.year ? `/${p.birthday.year}` : " (year unknown)"}
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-x-5 gap-y-2.5 sm:grid-cols-2">
        <Labelled label="Role">
          <Field value={p.role} onChange={(role) => onPatch({ role })} placeholder="—" />
        </Labelled>
        <Labelled label="Company">
          <Field value={p.company} onChange={(company) => onPatch({ company })} placeholder="—" />
        </Labelled>
        <Labelled label="City">
          <Field value={p.city} onChange={(city) => onPatch({ city })} placeholder="—" />
        </Labelled>
        <Labelled label="How we met">
          <Field value={p.how_we_met} onChange={(how_we_met) => onPatch({ how_we_met })} placeholder="—" />
        </Labelled>
        <Labelled label="Introduced by">
          <Field
            value={p.introduced_by}
            onChange={(introduced_by) => onPatch({ introduced_by })}
            placeholder="— (met cold)"
          />
        </Labelled>
        <Labelled label="Cadence">
          <select
            value={String(draft.cadenceDays)}
            onChange={(e) => onCadence(e.target.value === "null" ? null : Number(e.target.value))}
            className="border-line-soft -ml-1 rounded-md border bg-transparent px-1 py-0.5 text-sm"
          >
            {CADENCE_TIERS.map((t) => (
              <option key={t.label} value={String(t.days)}>
                {t.label}
                {t.days ? ` · ${t.days}d` : ""}
              </option>
            ))}
          </select>
        </Labelled>
      </div>

      <div className="mt-3">
        <Labelled label="Notes">
          <Field
            value={p.notes}
            onChange={(notes) => onPatch({ notes })}
            placeholder="The soft layer — spouse, kids, pets, where they grew up"
            multiline
          />
        </Labelled>
      </div>

      {p.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.tags.map((t) => (
            <button
              key={t.name}
              onClick={() => onPatch({ tags: p.tags.filter((x) => x.name !== t.name) })}
              title="Remove tag"
              className="border-line text-ink-soft hover:border-ink/30 rounded-full border px-2 py-0.5 text-xs"
            >
              {t.name}
              {t.kind ? <span className="text-ink-faint"> · {t.kind}</span> : null} ×
            </button>
          ))}
        </div>
      )}

      {draft.candidates.length > 0 && (
        <div className="border-line-soft mt-4 border-t pt-3">
          <p className="label-xs">
            {draft.candidates.length > 1 ? "Which one?" : "Already in the system"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {draft.candidates.map((c) => (
              <button
                key={c.person.id}
                onClick={() => onTarget(c.person.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${
                  draft.target === c.person.id
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-ink/25"
                }`}
              >
                <span className="block font-medium">{c.person.name}</span>
                <span className="text-ink-faint block">{c.detail}</span>
              </button>
            ))}
            <button
              onClick={() => onTarget("new")}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                draft.target === "new" ? "border-accent bg-accent-soft" : "border-line hover:border-ink/25"
              }`}
            >
              <span className="block font-medium">Create new</span>
              <span className="text-ink-faint block">a different person</span>
            </button>
          </div>
          {merging && (
            <p className="text-ink-faint mt-2 text-xs">
              Merging into their record — existing fields are kept, notes are added to.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-xs">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  className = "",
  multiline = false,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const shared = `w-full bg-transparent outline-none placeholder:text-ink-faint/70 focus:bg-accent-soft/50 rounded px-1 -mx-1 ${className}`;
  const handle = (v: string) => onChange(v.trim() === "" ? null : v);

  return multiline ? (
    <textarea
      value={value ?? ""}
      onChange={(e) => handle(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className={`${shared} resize-none text-sm leading-relaxed`}
    />
  ) : (
    <input
      value={value ?? ""}
      onChange={(e) => handle(e.target.value)}
      placeholder={placeholder}
      className={`${shared} text-sm`}
    />
  );
}
