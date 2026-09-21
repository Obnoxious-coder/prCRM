import { MergeButton, TagRow } from "@/components/TagCleanup";
import { Empty, SectionHeading } from "@/components/ui";
import { allTags, duplicateTagPairs } from "@/lib/tags";
import { TAG_KINDS } from "@/lib/types";

export const dynamic = "force-dynamic";

const KIND_HINTS: Record<string, string> = {
  context: "How you know them — meetup, ex-colleague, college, client",
  industry: "Who to connect to whom — fintech, legal, design, hiring",
  city: "Trip planning",
  strength: "Rough relationship temperature",
};

export default async function TagsPage() {
  const tags = allTags();
  const duplicates = duplicateTagPairs(tags);

  return (
    <div className="space-y-10">
      <SectionHeading
        title="Tags"
        hint="Keep the taxonomy loose. The parser invents tags freely; near-duplicates get merged here."
      />

      {duplicates.length > 0 && (
        <section>
          <SectionHeading title="Possible duplicates" hint="Same tag, different spelling." />
          <div className="card flex flex-wrap gap-2 p-4">
            {duplicates.map(([a, b]) => (
              <MergeButton key={`${a.id}-${b.id}`} keep={a} merge={b} />
            ))}
          </div>
        </section>
      )}

      {TAG_KINDS.map((kind) => {
        const group = tags.filter((t) => t.kind === kind);
        if (!group.length) return null;
        return (
          <section key={kind}>
            <SectionHeading title={kind} hint={KIND_HINTS[kind]} />
            <ul className="card px-4">
              {group.map((t) => (
                <TagRow key={t.id} tag={t} count={t.people_count} />
              ))}
            </ul>
          </section>
        );
      })}

      {(() => {
        const loose = tags.filter((t) => !t.kind);
        if (!loose.length) return null;
        return (
          <section>
            <SectionHeading title="Unclassified" hint="Give these a kind, or leave them — both are fine." />
            <ul className="card px-4">
              {loose.map((t) => (
                <TagRow key={t.id} tag={t} count={t.people_count} />
              ))}
            </ul>
          </section>
        );
      })()}

      {tags.length === 0 && <Empty>No tags yet. They arrive with your first capture.</Empty>}
    </div>
  );
}
