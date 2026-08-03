"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import type { FirehoseTickDTO, RawSignalDTO, StatusDTO } from "@/lib/client-types";

export function Firehose() {
  const [signals, setSignals] = useState<RawSignalDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta] = useState<{ fetched: number; matched: number; laser: StatusDTO } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoTicks, setAutoTicks] = useState<FirehoseTickDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/signals/status");
        const data = (await res.json()) as StatusDTO;
        if (!cancelled) setAutoTicks(data.recentTicks ?? []);
      } catch {
        // status polling is best-effort; ignore
      }
    }
    poll();
    const id = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function pull() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/signals/ingest", { method: "POST" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setSignals(data.signals);
      setMeta({ fetched: data.fetched, matched: data.matched, laser: data.laser });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-sand-dark bg-cream-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-terracotta">
            <Radio className="h-4 w-4" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">Live signal firehose</h2>
            <p className="text-xs text-ink-soft">
              Real HN Algolia + GitHub search API calls, made right now. Sector-keyword matches get written
              onto the graph as a real HAD_SIGNAL edge.
            </p>
          </div>
        </div>
        <button
          onClick={pull}
          disabled={loading}
          className="shrink-0 rounded-lg bg-terracotta px-3 py-1.5 text-xs font-medium text-cream-card hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Pulling…" : "Pull live signals"}
        </button>
      </div>

      {autoTicks.length > 0 && (
        <p className="mb-2 text-xs text-ink-faint">
          Background scheduler: {autoTicks.length} auto-tick{autoTicks.length === 1 ? "" : "s"} this session, last at{" "}
          {new Date(autoTicks[autoTicks.length - 1].at).toLocaleTimeString()} (
          {autoTicks[autoTicks.length - 1].matched} matched of {autoTicks[autoTicks.length - 1].fetched}). Memory keeps
          compounding without a click.
        </p>
      )}

      {error && <p className="text-xs text-terracotta-dark">Error: {error}</p>}

      {meta && (
        <p className="mb-2 text-xs text-ink-faint">
          Fetched {meta.fetched}, matched {meta.matched} to tracked sectors. Transport: {meta.laser.mode} ({meta.laser.detail}).
        </p>
      )}

      <div className="max-h-72 space-y-1.5 overflow-y-auto">
        {signals.map((s) => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-sand-dark bg-sand/30 px-3 py-2 text-xs hover:bg-sand/60"
          >
            <span className="truncate text-ink">{s.headline}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded bg-sand px-1.5 py-0.5 text-ink-soft">{s.source}</span>
              {s.matchedStartupId && (
                <span className="rounded bg-sage-light px-1.5 py-0.5 text-sage">→ {s.matchedStartupId}</span>
              )}
            </span>
          </a>
        ))}
        {signals.length === 0 && !loading && (
          <p className="py-4 text-center text-xs text-ink-faint">No signals pulled yet.</p>
        )}
      </div>
    </section>
  );
}
