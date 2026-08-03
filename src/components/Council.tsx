"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, AlertTriangle, Ban } from "lucide-react";
import type { AblationStateDTO, AgentTraceStepDTO, ApprovalEntryDTO, VetoedCandidateDTO } from "@/lib/client-types";
import { AgentPipelineStrip } from "./AgentPipelineStrip";
import { CandidateTable, mergeCandidateRows } from "./CandidateTable";

const toggles: { key: keyof AblationStateDTO; label: string; icon: typeof Clock; description: string }[] = [
  { key: "ignoreTimePredicate", label: "time", icon: Clock, description: "Drops the after-pass predicate — should INCREASE the candidate count, not decrease it." },
  { key: "forceTypeMismatch", label: "reason", icon: AlertTriangle, description: "Forces a wrong signal type on the next ingested live signal — Citation & Draft should decline it." },
  { key: "bypassSkeptic", label: "skeptik", icon: Ban, description: "Bypasses Skeptic's veto — the rumor-flagged draft should reach Approval unchecked." },
];

/**
 * The whole "prove Guild is load-bearing" story lives on this one screen:
 * the pipeline strip shows the council actually working through agents in
 * order, the table shows every candidate's fate in one row, and the
 * ablation switches sit right next to what they affect so toggling one and
 * watching the table update reads as a single motion, not two.
 */
export function Council() {
  const [queue, setQueue] = useState<ApprovalEntryDTO[]>([]);
  const [vetoed, setVetoed] = useState<VetoedCandidateDTO[]>([]);
  const [trace, setTrace] = useState<AgentTraceStepDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [ablation, setAblation] = useState<AblationStateDTO | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      setQueue(data.queued);
      setVetoed(data.vetoed ?? []);
      setTrace(data.trace);
      setHasRun(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/ablation")
      .then((r) => r.json())
      .then(setAblation);
  }, []);

  async function toggleAblation(key: keyof AblationStateDTO) {
    if (!ablation) return;
    setToggleBusy(key);
    try {
      const res = await fetch("/api/ablation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: !ablation[key] }),
      });
      const data = await res.json();
      setAblation(data);
      // Live in-place effect: if the council has already run once, flipping
      // a switch re-runs it immediately so the table updates on its own —
      // no separate "now click Run again" step to remember.
      if (hasRun) await run();
    } finally {
      setToggleBusy(null);
    }
  }

  async function act(key: string, action: "approve" | "reject") {
    setBusyKey(key);
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
      setBusyKey(null);
    }
  }

  const rows = mergeCandidateRows(queue, vetoed);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Agent council</h2>
          <p className="text-xs text-ink-soft">
            Eligibility → Skeptic → Investment Angle → Citation &amp; Draft → Approval. Memory decides who,
            the council decides whether, a human decides now.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 rounded-lg bg-terracotta px-4 py-2 text-xs font-semibold text-cream-card transition hover:bg-terracotta-dark disabled:opacity-50"
        >
          {loading ? "Running…" : "Run pipeline"}
        </button>
      </div>

      <AgentPipelineStrip trace={trace} loading={loading} />

      <CandidateTable rows={rows} busyKey={busyKey} onAct={act} />

      <div className="rounded-2xl border border-sand-dark bg-cream-card p-4">
        <h3 className="mb-3 text-xs font-semibold text-ink">Ablation switches</h3>
        <div className="flex flex-wrap gap-2">
          {toggles.map((t) => {
            const on = ablation?.[t.key] ?? false;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => toggleAblation(t.key)}
                disabled={!ablation || toggleBusy === t.key}
                title={t.description}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
                  on ? "border-terracotta bg-sand text-terracotta-dark" : "border-sand-dark bg-sand/40 text-ink-soft hover:bg-sand"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {t.label}
                <span className="text-[10px] opacity-70">{on ? "ON" : "off"}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10px] text-ink-faint">Edge severing lives in the Kill shot section — it&rsquo;s a real graph mutation, not a toggle.</p>
      </div>
    </div>
  );
}
