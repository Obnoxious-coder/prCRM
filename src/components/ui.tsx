import Link from "next/link";
import { formatDate, relativeLabel, type ISODate } from "@/lib/dates";
import type { Person, Tag } from "@/lib/types";

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <h2 className="font-serif text-xl leading-tight">{title}</h2>
        {hint && <p className="text-ink-soft mt-0.5 text-[0.8125rem]">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-soft py-2 text-sm">{children}</p>;
}

export function TagPill({ tag, href }: { tag: Tag | { name: string; kind: string | null }; href?: string }) {
  const body = (
    <span className="border-line text-ink-soft inline-flex items-center gap-1 rounded-full border px-2 py-[0.15rem] text-[0.6875rem] whitespace-nowrap">
      {tag.kind && <span className={`h-1.5 w-1.5 rounded-full ${kindDot(tag.kind)}`} />}
      {tag.name}
    </span>
  );
  return href ? (
    <Link href={href} className="hover:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}

function kindDot(kind: string | null): string {
  switch (kind) {
    case "industry": return "bg-accent";
    case "city": return "bg-wildcard";
    case "context": return "bg-ink-faint";
    case "strength": return "bg-birthday";
    default: return "bg-line";
  }
}

export function PersonLine({
  person,
  right,
  tags,
}: {
  person: Person;
  right?: React.ReactNode;
  tags?: Tag[];
}) {
  const meta = [person.role, person.company, person.city].filter(Boolean).join(" · ");
  return (
    <li className="border-line-soft flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0">
      <div className="min-w-0">
        <Link href={`/people/${person.id}`} className="hover:text-accent font-medium transition-colors">
          {person.name}
        </Link>
        {meta && <span className="text-ink-soft ml-2 text-[0.8125rem]">{meta}</span>}
        {tags && tags.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {tags.slice(0, 4).map((t) => (
              <TagPill key={t.id} tag={t} href={`/people?tag=${encodeURIComponent(t.name)}`} />
            ))}
          </span>
        )}
      </div>
      {right && <div className="text-ink-soft shrink-0 text-right text-xs">{right}</div>}
    </li>
  );
}

export function LastSeen({ date, today }: { date: ISODate | null; today: ISODate }) {
  if (!date) return <span className="text-ink-faint">never logged</span>;
  return (
    <span title={formatDate(date)}>
      {relativeLabel(date, today)}
    </span>
  );
}

export function OverdueBadge({ days }: { days: number | null }) {
  if (days === null || days <= 0) return null;
  return <span className="text-overdue font-medium">{days}d overdue</span>;
}

export function Stat({ value, label, href }: { value: React.ReactNode; label: string; href?: string }) {
  const body = (
    <div className="card px-4 py-3">
      <div className="font-serif text-2xl leading-none">{value}</div>
      <div className="text-ink-soft mt-1 text-xs">{label}</div>
    </div>
  );
  return href ? (
    <Link href={href} className="hover:border-ink/25 block transition-colors">
      {body}
    </Link>
  ) : (
    body
  );
}
