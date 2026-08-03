"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, AlertTriangle, Ban, X } from "lucide-react";
import type { AblationStateDTO, AgentTraceStepDTO, ApprovalEntryDTO, VetoedCandidateDTO } from "@/lib/client-types";
import { AgentPipelineStrip } from "./AgentPipelineStrip";
import { CandidateTable, mergeCandidateRows } from "./CandidateTable";

const toggles: { key: keyof AblationStateDTO; label: string; icon: typeof Clock; description: string }[] = [
  { key: "ignoreTimePredicate", label: "time", icon: Clock, description: "Drops the after-pass predicate — should INCREASE the candidate count, not decrease it." },
  { key: "forceTypeMismatch", label: "reason", icon: AlertTriangle, description: "Forces a wrong signal type on the next ingested live signal — Citation & Draft should decline it." },
  { key: "bypassSkeptic", label: "skeptik", icon: Ban, description: "Bypasses Skeptic's veto — the rumor-flagged draft should reach Approval unchecked." },
];

interface EmailModalState {
  key: string;
  startupName: string;
}

/**
 * Circle pops in first (check-circle-pop), then the check stroke draws in
 * after a short delay (check-mark-draw) — the two keyframes are defined
 * globally in globals.css since Tailwind has no utility for a dasharray
 * stroke animation.
 */
function AnimatedCheck() {
  return (
    <svg viewBox="0 0 52 52" className="h-14 w-14" style={{ animation: "check-circle-pop 0.4s ease-out" }}>
      <circle cx="26" cy="26" r="24" fill="none" stroke="var(--color-sage)" strokeWidth="3" />
      <path
        d="M14 27l7 7 16-16"
        fill="none"
        stroke="var(--color-sage)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          strokeDasharray: 40,
          strokeDashoffset: 40,
          animation: "check-mark-draw 0.35s ease-out 0.35s forwards",
        }}
      />
    </svg>
  );
}

/**
 * Approving a draft actually posts to a Slack webhook under the hood (see
 * lib/slack/notify.ts) — the demo story is about the email a VC would
 * actually see land, so this pops up over the whole screen rather than
 * sitting quietly in the table row. Only opens once /api/run/approve has
 * actually resolved, so it never renders a "sent" state before that's true.
 */
function EmailSentModal({ modal, onClose }: { modal: EmailModalState | null; onClose: () => void }) {
  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-xs rounded-2xl border border-sand-dark bg-cream-card p-8 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          title="Close"
          className="absolute right-3 top-3 text-ink-faint transition hover:text-ink"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="flex flex-col items-center gap-3">
          <AnimatedCheck />
          <div>
            <p className="text-xs text-ink-faint">{modal.startupName}</p>
            <p className="mt-0.5 text-base font-semibold text-ink">Sent with Gmail</p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [busy, setBusy] = useState<{ key: string; action: "approve" | "reject" } | null>(null);
  const [emailModal, setEmailModal] = useState<EmailModalState | null>(null);
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
    setBusy({ key, action });
    try {
      const res = await fetch(`/api/run/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = await res.json();
      if (data.ok) {
        setQueue((q) => q.map((e) => (e.key === key ? data.entry : e)));
        if (action === "approve") {
          setEmailModal({ key, startupName: data.entry.startupName });
        }
      }
    } finally {
      setBusy(null);
    }
  }

  const rows = mergeCandidateRows(queue, vetoed, trace);

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

      <CandidateTable rows={rows} busy={busy} onAct={act} />

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

      <EmailSentModal modal={emailModal} onClose={() => setEmailModal(null)} />
    </div>
  );
}
