"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { saveViewAction, deleteViewAction } from "@/app/actions";
import { parseFilters, type Filters } from "@/lib/filters";

const QUIET_OPTIONS = [
  { label: "any", value: "" },
  { label: "3 months", value: "90" },
  { label: "6 months", value: "180" },
  { label: "1 year", value: "365" },
];

export function FilterBar({
  cities,
  tags,
  views,
}: {
  cities: string[];
  tags: string[];
  views: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const filters: Filters = parseFilters(new URLSearchParams(params.toString()));
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();

  function update(mutate: (p: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    router.push(next.toString() ? `/people?${next}` : "/people");
  }

  const activeTags = params.getAll("tag");

  return (
    <div className="card mb-5 space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          defaultValue={filters.q ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              update((p) => (v ? p.set("q", v) : p.delete("q")));
            }
          }}
          placeholder="Search names, notes, companies…"
          className="border-line focus:border-ink/30 min-w-52 flex-1 rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none"
        />
        <select
          value={filters.city ?? ""}
          onChange={(e) => update((p) => (e.target.value ? p.set("city", e.target.value) : p.delete("city")))}
          className="border-line rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
        >
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={String(filters.quietForDays ?? "")}
          onChange={(e) => update((p) => (e.target.value ? p.set("quiet", e.target.value) : p.delete("quiet")))}
          className="border-line rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
        >
          {QUIET_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value ? `Quiet ${o.label}+` : "Any recency"}
            </option>
          ))}
        </select>
        <select
          value={filters.sort ?? "name"}
          onChange={(e) => update((p) => p.set("sort", e.target.value))}
          className="border-line rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
        >
          <option value="name">A–Z</option>
          <option value="overdue">Most overdue</option>
          <option value="recent">Recently contacted</option>
          <option value="added">Recently added</option>
        </select>
        <Toggle
          on={Boolean(filters.overdueOnly)}
          onClick={() => update((p) => (filters.overdueOnly ? p.delete("overdue") : p.set("overdue", "1")))}
        >
          Overdue only
        </Toggle>
        <Toggle
          on={Boolean(filters.orphansOnly)}
          onClick={() => update((p) => (filters.orphansOnly ? p.delete("orphans") : p.set("orphans", "1")))}
        >
          Met cold
        </Toggle>
        <Toggle
          on={Boolean(filters.untagged)}
          onClick={() => update((p) => (filters.untagged ? p.delete("untagged") : p.set("untagged", "1")))}
        >
          Untagged
        </Toggle>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const on = activeTags.includes(t);
            return (
              <button
                key={t}
                onClick={() =>
                  update((p) => {
                    const rest = activeTags.filter((x) => x !== t);
                    p.delete("tag");
                    for (const r of rest) p.append("tag", r);
                    if (!on) p.append("tag", t);
                  })
                }
                className={`rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                  on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:border-ink/25"
                }`}
              >
                {t}
              </button>
            );
          })}
        </div>
      )}

      <div className="border-line-soft flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
        {saving ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name this view"
              className="border-line rounded-md border bg-transparent px-2 py-1 outline-none"
            />
            <button
              disabled={pending || !name.trim()}
              onClick={() =>
                startTransition(async () => {
                  await saveViewAction(name, filters);
                  setName("");
                  setSaving(false);
                  router.refresh();
                })
              }
              className="bg-ink text-card rounded-md px-2.5 py-1 disabled:opacity-40"
            >
              Save view
            </button>
            <button onClick={() => setSaving(false)} className="text-ink-soft">Cancel</button>
          </>
        ) : (
          <button onClick={() => setSaving(true)} className="text-accent hover:underline">
            Save this filter as a view
          </button>
        )}
        {views.length > 0 && <span className="text-ink-faint">·</span>}
        {views.map((v) => (
          <span key={v.id} className="text-ink-faint">
            {v.name}
            <button
              onClick={() => startTransition(async () => { await deleteViewAction(v.id); router.refresh(); })}
              className="hover:text-overdue ml-1"
              title="Delete view"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
        on ? "border-accent bg-accent-soft text-accent" : "border-line text-ink-soft hover:border-ink/25"
      }`}
    >
      {children}
    </button>
  );
}
