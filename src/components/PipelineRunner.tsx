"use client";

import { useState } from "react";
import type { AgentTraceStepDTO, GatekeeperEntryDTO } from "@/lib/client-types";

const agentColor: Record<string, string> = {
  Sourcer: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  Analyst: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  Outreach: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  Gatekeeper: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

export function PipelineRunner() {
  const [queue, setQueue] = useState<GatekeeperEntryDTO[]>([]);
  const [trace, setTrace] = useState<AgentTraceStepDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      setQueue(data.queued);
      setTrace(data.trace);
    } finally {
      setLoading(false);
    }
  }

  async function act(key: string, action: "approve" | "reject") {
    setBusyId(key);
    try {
      const res = await fetch(`/api/run/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.ok) {
        setQueue((q) => q.map((e) => (e.key === key ? data.entry : e)));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-neutral-200">Resurfaced candidates</h2>
          <p className="text-xs text-neutral-500">
            Sourcer → Analyst → Outreach → Gatekeeper. One Cypher traversal, four agents, nothing sends without approval.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {loading ? "Running…" : "Run pipeline"}
        </button>
      </div>

      <div className="space-y-2">
        {queue.map((entry) => (
          <div key={entry.key} className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-200">{entry.startupId}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  entry.approvalStatus === "approved"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : entry.approvalStatus === "rejected"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {entry.approvalStatus}
              </span>
            </div>
            {entry.message && <p className="mb-2 text-xs text-neutral-400">{entry.message}</p>}
            {entry.motion && (
              <p
                className={`mb-2 text-[11px] ${entry.motion.mode === "live" ? "text-emerald-400" : "text-amber-400"}`}
              >
                {entry.motion.mode === "live" ? "✓ Sent to Slack" : `⚠ not sent (${entry.motion.detail})`}
              </p>
            )}
            {entry.approvalStatus === "pending" && (
              <div className="flex gap-2">
                <button
                  onClick={() => act(entry.key, "approve")}
                  disabled={busyId === entry.key}
                  className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => act(entry.key, "reject")}
                  disabled={busyId === entry.key}
                  className="rounded bg-red-600/80 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        ))}
        {queue.length === 0 && !loading && (
          <p className="py-4 text-center text-xs text-neutral-600">
            No candidates yet. Seed the graph, then run the pipeline.
          </p>
        )}
      </div>

      {trace.length > 0 && (
        <div className="mt-5 border-t border-neutral-800 pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Agent trace</h3>
          <div className="space-y-2">
            {trace.map((step, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${agentColor[step.agent]}`}>
                <div className="mb-1 font-semibold">{step.agent}</div>
                <div className="opacity-80">{step.note}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
