"use client";

import { useEffect, useState } from "react";
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
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">Live signal firehose</h2>
          <p className="text-xs text-neutral-500">
            Real HN Algolia + GitHub search API calls, made right now. Sector-keyword matches get written onto the graph as a real HAD_SIGNAL edge.
          </p>
        </div>
        <button
          onClick={pull}
          disabled={loading}
          className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Pulling…" : "Pull live signals"}
        </button>
      </div>

      {autoTicks.length > 0 && (
        <p className="mb-2 text-xs text-neutral-500">
          Background scheduler: {autoTicks.length} auto-tick{autoTicks.length === 1 ? "" : "s"} this session, last at{" "}
          {new Date(autoTicks[autoTicks.length - 1].at).toLocaleTimeString()} (
          {autoTicks[autoTicks.length - 1].matched} matched of {autoTicks[autoTicks.length - 1].fetched}). Memory keeps
          compounding without a click.
        </p>
      )}

      {error && <p className="text-xs text-red-400">Error: {error}</p>}

      {meta && (
        <p className="mb-2 text-xs text-neutral-500">
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
            className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-3 py-2 text-xs hover:border-neutral-700"
          >
            <span className="truncate text-neutral-300">{s.headline}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-400">{s.source}</span>
              {s.matchedStartupId && (
                <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-emerald-400">→ {s.matchedStartupId}</span>
              )}
            </span>
          </a>
        ))}
        {signals.length === 0 && !loading && (
          <p className="py-4 text-center text-xs text-neutral-600">No signals pulled yet.</p>
        )}
      </div>
    </section>
  );
}
