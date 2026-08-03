"use client";

import { useEffect, useState } from "react";
import { Scissors } from "lucide-react";
import type { KnowsEdgeDTO } from "@/lib/client-types";

export function KillShot() {
  const [edges, setEdges] = useState<KnowsEdgeDTO[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [severed, setSevered] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/graph/knows");
      const data = await res.json();
      if (!cancelled) setEdges(data.edges);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function keyOf(e: KnowsEdgeDTO) {
    return `${e.a}::${e.b}`;
  }

  async function sever(e: KnowsEdgeDTO) {
    setBusy(keyOf(e));
    try {
      await fetch("/api/graph/knows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", aId: e.a, bId: e.b }),
      });
      setSevered((s) => new Set(s).add(keyOf(e)));
    } finally {
      setBusy(null);
    }
  }

  async function restore(e: KnowsEdgeDTO) {
    setBusy(keyOf(e));
    try {
      await fetch("/api/graph/knows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", aId: e.a, bId: e.b, strength: e.strength, context: e.context }),
      });
      setSevered((s) => {
        const next = new Set(s);
        next.delete(keyOf(e));
        return next;
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-sand-dark bg-cream-card p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-terracotta">
          <Scissors className="h-4 w-4" strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-ink">Kill shot: prove the graph is load-bearing</h2>
          <p className="text-xs text-ink-soft">
            Sever a KNOWS edge, then re-run the pipeline in Agent council. The candidate reached through
            that edge disappears from the ranked list — because the path no longer exists in FalkorDB, not
            because a score changed.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {edges.map((e) => {
          const k = keyOf(e);
          const isSevered = severed.has(k);
          return (
            <div
              key={k}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                isSevered ? "border-terracotta/40 bg-sand/60 opacity-70" : "border-sand-dark bg-sand/30"
              }`}
            >
              <span className="text-ink">
                {e.aName} <span className="text-ink-faint">—[{e.strength}]→</span> {e.bName}
                <span className="ml-2 text-ink-faint">{e.context}</span>
              </span>
              {isSevered ? (
                <button
                  onClick={() => restore(e)}
                  disabled={busy === k}
                  className="rounded bg-sand-dark px-2 py-1 text-[11px] font-medium text-ink hover:opacity-80 disabled:opacity-50"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => sever(e)}
                  disabled={busy === k}
                  className="rounded bg-terracotta px-2 py-1 text-[11px] font-medium text-cream-card hover:opacity-90 disabled:opacity-50"
                >
                  Sever
                </button>
              )}
            </div>
          );
        })}
        {edges.length === 0 && <p className="py-4 text-center text-xs text-ink-faint">No KNOWS edges loaded. Seed the graph first.</p>}
      </div>
    </section>
  );
}
