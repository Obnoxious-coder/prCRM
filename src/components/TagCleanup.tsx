"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeTagsAction, renameTagAction } from "@/app/actions";
import { TAG_KINDS, type Tag, type TagKind } from "@/lib/types";

export function MergeButton({ keep, merge }: { keep: Tag; merge: Tag }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await mergeTagsAction(keep.id, merge.id);
          router.refresh();
        })
      }
      className="border-line hover:border-ink/25 rounded-md border px-2 py-0.5 text-xs disabled:opacity-40"
    >
      Merge “{merge.name}” into “{keep.name}”
    </button>
  );
}

export function TagRow({ tag, count }: { tag: Tag; count: number }) {
  const router = useRouter();
  const [name, setName] = useState(tag.name);
  const [kind, setKind] = useState<TagKind | "">(tag.kind ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = name !== tag.name || (kind || null) !== tag.kind;

  return (
    <li className="border-line-soft flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border-line focus:border-ink/30 w-40 rounded-md border bg-transparent px-2 py-1 text-sm outline-none"
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as TagKind | "")}
        className="border-line rounded-md border bg-transparent px-2 py-1 text-xs"
      >
        <option value="">no kind</option>
        {TAG_KINDS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <span className="text-ink-faint text-xs">{count} people</span>
      {dirty && (
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await renameTagAction(tag.id, name, kind || null);
              router.refresh();
            })
          }
          className="bg-ink text-card rounded-md px-2 py-1 text-xs disabled:opacity-40"
        >
          Save
        </button>
      )}
    </li>
  );
}
