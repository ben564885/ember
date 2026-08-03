"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { AgentTraceStepDTO } from "@/lib/client-types";

const AGENTS: { name: AgentTraceStepDTO["agent"]; icon: string }[] = [
  { name: "Eligibility", icon: "/agent-icons/eligibility.png" },
  { name: "Skeptic", icon: "/agent-icons/skeptic.png" },
  { name: "Investment Angle", icon: "/agent-icons/investment-angle.png" },
  { name: "Citation & Draft", icon: "/agent-icons/citation-draft.png" },
  { name: "Approval", icon: "/agent-icons/approval.png" },
];

/** Trace output shapes vary per agent; Skeptic's is the only one carrying a `vetoed` flag. */
function stepHasVeto(step: AgentTraceStepDTO | undefined): boolean {
  if (!step || step.agent !== "Skeptic" || !Array.isArray(step.output)) return false;
  return step.output.some((o) => o && typeof o === "object" && "vetoed" in o && (o as { vetoed: boolean }).vetoed);
}

/**
 * Replays the real trace returned by /api/run as a sequential reveal — the
 * data is genuine (each step already happened server-side before this
 * component ever sees it), the staggered pacing is presentation only, so a
 * judge watching "Run pipeline" sees the council work through candidates
 * one agent at a time instead of a wall of JSON landing all at once.
 */
export function AgentPipelineStrip({ trace, loading }: { trace: AgentTraceStepDTO[]; loading: boolean }) {
  const [revealed, setRevealed] = useState(0);
  // Reset during render when a new trace arrives, rather than in an
  // effect — React's recommended pattern for state that must snap back
  // when a prop changes, so the timer effect below only ever has to
  // schedule the reveal, never initialize it.
  const [trackedTrace, setTrackedTrace] = useState(trace);
  if (trace !== trackedTrace) {
    setTrackedTrace(trace);
    setRevealed(0);
  }

  useEffect(() => {
    if (trace.length === 0) return;
    const id = setInterval(() => {
      setRevealed((r) => {
        if (r >= trace.length) {
          clearInterval(id);
          return r;
        }
        return r + 1;
      });
    }, 450);
    return () => clearInterval(id);
  }, [trace]);

  const activeStep = trace[Math.min(revealed, trace.length - 1)];

  return (
    <div className="rounded-2xl border border-sand-dark bg-cream-card p-5">
      <div className="mb-4 flex items-center">
        {AGENTS.map((agent, i) => {
          const done = i < revealed;
          const isActive = i === revealed && revealed < trace.length;
          const veto = done && stepHasVeto(trace[i]);
          return (
            <div key={agent.name} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5 text-center">
                <div
                  className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    veto
                      ? "border-terracotta bg-sand"
                      : done
                        ? "border-sage bg-sage-light"
                        : isActive
                          ? "scale-110 border-terracotta bg-terracotta shadow-md"
                          : "border-sand-dark bg-sand"
                  }`}
                >
                  <div className="relative h-8 w-8 overflow-hidden rounded-full bg-white">
                    <Image src={agent.icon} alt={agent.name} fill sizes="32px" className="object-contain p-1" />
                  </div>
                  {veto && (
                    <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-cream-card bg-terracotta" />
                  )}
                </div>
                <span className={`w-16 text-[10px] font-medium leading-tight ${done || isActive ? "text-ink" : "text-ink-faint"}`}>
                  {agent.name}
                </span>
              </div>
              {i < AGENTS.length - 1 && (
                <div
                  className={`mx-1 h-0.5 flex-1 rounded transition-colors duration-300 ${i < revealed ? "bg-sage" : "bg-sand-dark"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {activeStep && (
        <div className="rounded-lg bg-sand/60 px-3 py-2 text-xs text-ink-soft">
          <span className="font-semibold text-ink">{activeStep.agent}: </span>
          {activeStep.note}
        </div>
      )}
      {trace.length === 0 && !loading && (
        <p className="py-2 text-center text-xs text-ink-faint">Run the pipeline to watch the council work.</p>
      )}
    </div>
  );
}
