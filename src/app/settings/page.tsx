import { SectionHeading } from "@/components/ui";
import { updateSettingsAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/digest";
import { activeModel, activeProvider } from "@/lib/parse";
import { DEFAULT_OPENROUTER_MODEL } from "@/lib/parse/openrouter";

export const dynamic = "force-dynamic";

interface ParseLog {
  id: string;
  raw_input: string;
  parsed_output: string | null;
  source: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export default async function SettingsPage() {
  const settings = getSettings();
  const provider = activeProvider();
  const model = activeModel();
  const logs = getDb()
    .prepare(`SELECT * FROM parse_logs ORDER BY created_at DESC LIMIT 25`)
    .all() as ParseLog[];

  return (
    <div className="space-y-10">
      <section>
        <SectionHeading title="Digest delivery" hint="Early Monday, in your timezone." />
        <form action={updateSettingsAction} className="card grid gap-3 p-4 sm:grid-cols-2">
          <label>
            <span className="label-xs">Email address</span>
            <input
              name="digest_email"
              type="email"
              defaultValue={settings.digest_email ?? ""}
              placeholder="you@example.com"
              className="border-line focus:border-ink/30 mt-1 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
          </label>
          <label>
            <span className="label-xs">Frequency</span>
            <select
              name="digest_frequency"
              defaultValue={settings.digest_frequency}
              className="border-line mt-1 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
            </select>
          </label>
          <label>
            <span className="label-xs">Timezone</span>
            <input
              name="timezone"
              defaultValue={settings.timezone}
              className="border-line focus:border-ink/30 mt-1 w-full rounded-lg border bg-transparent px-2.5 py-1.5 text-sm outline-none"
            />
          </label>
          <div className="flex items-end">
            <button className="bg-ink text-card rounded-lg px-3.5 py-1.5 text-sm font-medium">Save</button>
          </div>
        </form>
        <p className="text-ink-soft mt-2 text-xs leading-relaxed">
          Frequency drops to fortnightly on its own after three unopened digests, rather than continuing
          to shout into a void.
        </p>
      </section>

      <section>
        <SectionHeading title="Parse" hint="Where the capture box sends your text." />
        <div className="card space-y-2 p-4 text-sm">
          <Line label="Provider">
            {provider === "rules" ? "built-in rules (no key configured)" : provider}
          </Line>
          <Line label="Model">{model ?? "—"}</Line>
          <div className="text-ink-soft border-line-soft border-t pt-3 text-xs leading-relaxed">
            <p className="mb-1">Set one of these and restart:</p>
            <pre className="bg-paper overflow-x-auto rounded-md p-2.5 text-[0.7rem] leading-relaxed">{`OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=${DEFAULT_OPENROUTER_MODEL}   # optional

# or, to call Anthropic directly
ANTHROPIC_API_KEY=sk-ant-...

# optional, for emailed digests
RESEND_API_KEY=re_...`}</pre>
            <p className="mt-2">
              With no key, captures are parsed by the deterministic rules instead. Nothing breaks — the
              extraction is just thinner.
            </p>
          </div>
        </div>
      </section>

      <section>
        <SectionHeading
          title="Parse log"
          hint="Every raw input alongside its parsed output, from day one — so when it gets something wrong you can see exactly what it saw."
        />
        {logs.length === 0 ? (
          <p className="text-ink-soft text-sm">Nothing captured yet.</p>
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="card p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm">{log.raw_input}</span>
                  <span className="text-ink-faint text-xs">
                    {log.source}
                    {log.duration_ms !== null ? ` · ${log.duration_ms}ms` : ""}
                  </span>
                </div>
                {log.error && <p className="text-overdue mt-1 text-xs">{log.error}</p>}
                {log.parsed_output && (
                  <details className="mt-1.5">
                    <summary className="text-ink-faint cursor-pointer text-xs">parsed output</summary>
                    <pre className="bg-paper mt-1.5 overflow-x-auto rounded-md p-2.5 text-[0.7rem] leading-relaxed">
                      {JSON.stringify(JSON.parse(log.parsed_output), null, 2)}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="label-xs w-20 shrink-0">{label}</span>
      <span>{children}</span>
    </div>
  );
}
