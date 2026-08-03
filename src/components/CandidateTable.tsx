"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, X } from "lucide-react";
import type { AgentTraceStepDTO, ApprovalEntryDTO, VetoedCandidateDTO } from "@/lib/client-types";

export interface CandidateRow {
  key: string;
  startupId: string;
  startupName: string;
  pathNames: string[];
  signalHeadline: string;
  vetoed: boolean;
  skepticVerdict?: "confirmed" | "rumor";
  skepticSource?: "guild" | "xai" | "simulated";
  skepticReasoning?: string;
  investmentAngleSource?: "guild" | "live" | "simulated";
  citationDraftSource?: "provided" | "guild" | "rebuilt";
  approval?: ApprovalEntryDTO;
}

/**
 * Trace step `output` is `unknown` on the wire (see AgentTraceStepDTO) —
 * each stage's shape is only known by convention, not enforced end to end.
 * These pull just the `key`/`source` pair each stage's own guild/*.ts
 * actually emits (see investment-angle.ts and citation-draft.ts), so a
 * shape drift there fails closed to "no badge" instead of a runtime crash.
 */
function sourceByKey(step: AgentTraceStepDTO | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!step || !Array.isArray(step.output)) return map;
  for (const o of step.output) {
    if (o && typeof o === "object" && "key" in o && "source" in o) {
      const { key, source } = o as { key: unknown; source: unknown };
      if (typeof key === "string" && typeof source === "string") map.set(key, source);
    }
  }
  return map;
}

export function mergeCandidateRows(
  queue: ApprovalEntryDTO[],
  vetoed: VetoedCandidateDTO[],
  trace: AgentTraceStepDTO[] = [],
): CandidateRow[] {
  const rows = new Map<string, CandidateRow>();
  // The `vetoed` prop only carries rumor-flagged candidates (see
  // orchestrate.ts / skeptic.ts) — it's where skepticReasoning comes from,
  // since that sentence only matters for the ones actually flagged. But
  // Skeptic runs on *every* candidate, and its full per-candidate trace
  // step (unlike `vetoed`) has all of them, so the "via guild" badge
  // itself is derived from there, not from `vetoed`.
  const skepticSources = sourceByKey(trace.find((s) => s.agent === "Skeptic"));
  const angleSources = sourceByKey(trace.find((s) => s.agent === "Investment Angle"));
  const draftSources = sourceByKey(trace.find((s) => s.agent === "Citation & Draft"));

  for (const v of vetoed) {
    rows.set(v.candidate.key, {
      key: v.candidate.key,
      startupId: v.candidate.startupId,
      startupName: v.candidate.startupName,
      pathNames: v.candidate.pathNames,
      signalHeadline: v.candidate.signalHeadline,
      vetoed: v.vetoed,
      skepticVerdict: v.skeptic.verdict,
      skepticSource: v.skeptic.source,
      skepticReasoning: v.skeptic.reasoning,
      investmentAngleSource: angleSources.get(v.candidate.key) as CandidateRow["investmentAngleSource"],
      citationDraftSource: draftSources.get(v.candidate.key) as CandidateRow["citationDraftSource"],
    });
  }

  for (const q of queue) {
    const existing = rows.get(q.key);
    rows.set(q.key, {
      key: q.key,
      startupId: q.startupId,
      startupName: q.startupName,
      pathNames: q.pathNames,
      signalHeadline: q.signalHeadline,
      vetoed: existing?.vetoed ?? false,
      skepticVerdict: existing?.skepticVerdict,
      skepticSource: existing?.skepticSource ?? (skepticSources.get(q.key) as CandidateRow["skepticSource"]),
      skepticReasoning: existing?.skepticReasoning,
      investmentAngleSource: existing?.investmentAngleSource ?? (angleSources.get(q.key) as CandidateRow["investmentAngleSource"]),
      citationDraftSource: existing?.citationDraftSource ?? (draftSources.get(q.key) as CandidateRow["citationDraftSource"]),
      approval: q,
    });
  }

  // Pending first (needs a human), then vetoed (the interesting proof
  // point), then resolved — keeps the row a judge should look at on top.
  const rank = (r: CandidateRow) =>
    r.approval?.approvalStatus === "pending" ? 0 : r.vetoed ? 1 : r.approval?.approvalStatus === "approved" ? 2 : 3;
  return Array.from(rows.values()).sort((a, b) => rank(a) - rank(b));
}

/**
 * A visible per-stage "this candidate actually hit Guild.ai" tag — the
 * server trace already knows this (see sourceByKey above), it just wasn't
 * shown anywhere before. Only Skeptic, Investment Angle, and Citation &
 * Draft call out to Guild; Eligibility and Approval don't appear here.
 */
function SourceBadge({ label, source }: { label: string; source?: string }) {
  if (!source) return null;
  const isGuild = source === "guild";
  return (
    <span
      title={`${label}: via ${source}`}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${
        isGuild ? "border-terracotta/40 bg-sand text-terracotta-dark" : "border-sand-dark bg-sand/40 text-ink-faint"
      }`}
    >
      {isGuild && (
        <span className="relative h-3 w-3 shrink-0 overflow-hidden rounded-full">
          <Image src="/logos/guild.jpeg" alt="Guild" fill sizes="12px" className="object-cover" />
        </span>
      )}
      {label}
    </span>
  );
}

function statusChip(row: CandidateRow): { label: string; className: string } {
  if (row.vetoed) return { label: "Vetoed — rumor", className: "bg-sand text-terracotta-dark" };
  const a = row.approval;
  if (!a) return { label: "confirmed", className: "bg-sage-light text-sage" };
  if (a.approvalStatus === "pending") return { label: "Pending approval", className: "bg-gold-light text-gold" };
  if (a.approvalStatus === "approved") return { label: "Approved → Slack", className: "bg-sage-light text-sage" };
  if (a.message === null) return { label: "Declined — type mismatch", className: "bg-sand text-terracotta-dark" };
  return { label: "Rejected by you", className: "bg-sand-dark text-ink-soft" };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function WarmPath({ names }: { names: string[] }) {
  return (
    <div className="flex items-center">
      {names.map((n, i) => (
        <span key={i} className="flex items-center">
          {i > 0 && <span className="mx-0.5 text-ink-faint">→</span>}
          <span
            title={n}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-sand-dark bg-sand text-[9px] font-semibold text-ink-soft"
          >
            {initials(n)}
          </span>
        </span>
      ))}
    </div>
  );
}

export function CandidateTable({
  rows,
  busyKey,
  onAct,
}: {
  rows: CandidateRow[];
  busyKey: string | null;
  onAct: (key: string, action: "approve" | "reject") => void;
}) {
  const prevSignatures = useRef<Map<string, string>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changed = new Set<string>();
    for (const r of rows) {
      const sig = `${r.vetoed}:${r.approval?.approvalStatus ?? ""}`;
      const prev = prevSignatures.current.get(r.key);
      if (prev !== undefined && prev !== sig) changed.add(r.key);
      prevSignatures.current.set(r.key, sig);
    }
    if (changed.size > 0) {
      // Deferred a tick so the state write happens inside a scheduled
      // callback rather than synchronously in the effect body.
      const flashTimer = setTimeout(() => setFlashing(changed), 0);
      const clearTimer = setTimeout(() => setFlashing(new Set()), 900);
      return () => {
        clearTimeout(flashTimer);
        clearTimeout(clearTimer);
      };
    }
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-sand-dark bg-cream-card p-8 text-center text-xs text-ink-faint">
        No candidates yet. Seed the graph, then run the pipeline.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sand-dark bg-cream-card">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-sand-dark bg-sand/50 text-[10px] uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-3 font-semibold">Startup</th>
            <th className="px-4 py-3 font-semibold">Warm path</th>
            <th className="px-4 py-3 font-semibold">Signal</th>
            <th className="px-4 py-3 font-semibold">Verdict / stage</th>
            <th className="px-4 py-3 font-semibold" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const chip = statusChip(row);
            const isFlashing = flashing.has(row.key);
            return (
              <tr
                key={row.key}
                className={`border-b border-sand-dark/60 last:border-0 transition-colors duration-700 ${
                  isFlashing ? "bg-gold-light" : "bg-transparent"
                }`}
              >
                <td className="px-4 py-3 font-medium text-ink">{row.startupName}</td>
                <td className="px-4 py-3">
                  <WarmPath names={row.pathNames} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 text-ink-soft" title={row.signalHeadline}>
                  {row.signalHeadline}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${chip.className}`}>
                    {chip.label}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <SourceBadge label="Skeptic" source={row.skepticSource} />
                    <SourceBadge label="Angle" source={row.investmentAngleSource} />
                    <SourceBadge label="Draft" source={row.citationDraftSource} />
                  </div>
                  {row.skepticReasoning && (
                    <p className="mt-1 max-w-[240px] text-[10px] text-ink-faint" title={row.skepticReasoning}>
                      {row.skepticReasoning}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  {row.approval?.approvalStatus === "pending" && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => onAct(row.key, "approve")}
                        disabled={busyKey === row.key}
                        title="Approve"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-sage text-cream-card transition hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                      <button
                        onClick={() => onAct(row.key, "reject")}
                        disabled={busyKey === row.key}
                        title="Reject"
                        className="flex h-7 w-7 items-center justify-center rounded-lg bg-terracotta text-cream-card transition hover:opacity-90 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                  {row.approval?.motion && (
                    <p className={`text-[10px] ${row.approval.motion.mode === "live" ? "text-sage" : "text-ink-faint"}`}>
                      {row.approval.motion.mode === "live" ? "✓ sent to Slack" : "not sent"}
                    </p>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
