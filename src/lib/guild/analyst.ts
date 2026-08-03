import type { ResurfacedCandidate } from "@/lib/graph/queries";
import { decideNextAction } from "@/lib/rocketride/decide";
import type { AgentTraceStep, AnalystOutput } from "./types";

/**
 * Analyst: takes exactly what Sourcer returned — never queries FalkorDB or
 * the live signal feed itself — and asks RocketRide (or its honest local
 * fallback) to decide the re-engagement angle. Analyst cannot invent a
 * relationship: its only input is the candidate object Sourcer already
 * validated against the graph.
 */
export async function runAnalyst(
  candidates: ResurfacedCandidate[],
): Promise<{ analyzed: AnalystOutput[]; trace: AgentTraceStep }> {
  // Concurrent, not sequential: each candidate's decision is independent,
  // and decideNextAction is bounded by its own timeout when RocketRide is
  // live (see rocketride/client.ts) — sequential awaits would multiply
  // that bound by candidate count for no reason.
  const analyzed: AnalystOutput[] = await Promise.all(
    candidates.map(async (candidate) => ({ candidate, decision: await decideNextAction(candidate) })),
  );

  return {
    analyzed,
    trace: {
      agent: "Analyst",
      input: { candidateCount: candidates.length },
      output: analyzed.map((a) => ({
        startupId: a.candidate.startupId,
        confidence: a.decision.confidence,
        source: a.decision.source,
      })),
      note: `Ran RocketRide decision pipeline on ${candidates.length} candidate(s). No direct graph or signal-feed access — input is exactly Sourcer's output.`,
    },
  };
}
