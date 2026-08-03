"use client";

import { useEffect, useState } from "react";
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
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-neutral-200">Kill shot: prove the graph is load-bearing</h2>
        <p className="text-xs text-neutral-500">
          Sever a KNOWS edge, then re-run the pipeline above. The candidate reached through that edge
          disappears from the ranked list — because the path no longer exists in FalkorDB, not
          because a score changed.
        </p>
      </div>

      <div className="space-y-1.5">
        {edges.map((e) => {
          const k = keyOf(e);
          const isSevered = severed.has(k);
          return (
            <div
              key={k}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                isSevered ? "border-red-500/30 bg-red-500/5 opacity-60" : "border-neutral-800/60 bg-neutral-900/40"
              }`}
            >
              <span className="text-neutral-300">
                {e.aName} <span className="text-neutral-600">—[{e.strength}]→</span> {e.bName}
                <span className="ml-2 text-neutral-600">{e.context}</span>
              </span>
              {isSevered ? (
                <button
                  onClick={() => restore(e)}
                  disabled={busy === k}
                  className="rounded bg-neutral-700 px-2 py-1 text-[11px] font-medium text-white hover:bg-neutral-600 disabled:opacity-50"
                >
                  Restore
                </button>
              ) : (
                <button
                  onClick={() => sever(e)}
                  disabled={busy === k}
                  className="rounded bg-red-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Sever
                </button>
              )}
            </div>
          );
        })}
        {edges.length === 0 && <p className="py-4 text-center text-xs text-neutral-600">No KNOWS edges loaded. Seed the graph first.</p>}
      </div>
    </section>
  );
}
