import { decideNextAction } from "@/lib/rocketride/decide";
import { callGuildAgent, mapWithGuildConcurrency } from "@/lib/guild-platform/client";
import type { ResurfacedCandidate } from "@/lib/graph/queries";
import type { AgentTraceStep, DecisionOutput, SkepticOutput } from "./types";

interface InvestmentAngleAgentOutput {
  angle: string;
  draft: string;
  confidence: "high" | "medium" | "low";
}

function isInvestmentAngleAgentOutput(o: unknown): o is InvestmentAngleAgentOutput {
  if (!o || typeof o !== "object") return false;
  const r = o as Partial<InvestmentAngleAgentOutput>;
  return (
    typeof r.angle === "string" &&
    typeof r.draft === "string" &&
    (r.confidence === "high" || r.confidence === "medium" || r.confidence === "low")
  );
}

async function decide(candidate: ResurfacedCandidate): Promise<DecisionOutput["decision"]> {
  const viaGuild = await callGuildAgent(
    "investment-angle",
    {
      startupName: candidate.startupName,
      sector: candidate.sector,
      passReason: candidate.passReason,
      signalType: candidate.signalType,
      signalHeadline: candidate.signalHeadline,
      founderName: candidate.founderName,
      pathHops: candidate.pathHops,
      pathNames: candidate.pathNames,
    },
    isInvestmentAngleAgentOutput,
  );
  if (viaGuild) return { ...viaGuild, source: "guild" };

  return decideNextAction(candidate);
}

/**
 * Investment Angle (formerly "Analyst"): takes exactly what Skeptic passed
 * through — never queries FalkorDB or the live signal feed itself — and
 * decides the re-engagement angle. Tries a real deployed Guild.ai agent
 * first, then RocketRide (or its own live/simulated tiers), same
 * honest-degradation chain as Skeptic. "Packet only, no tools": its only
 * inputs are the candidate object and Skeptic's verdict, both already
 * validated upstream.
 */
export async function runInvestmentAngle(
  survived: SkepticOutput[],
): Promise<{ analyzed: DecisionOutput[]; trace: AgentTraceStep }> {
  // Concurrent, not sequential, but capped: each candidate's decision is
  // independent, and decide() is bounded by its own timeouts at each tier —
  // but firing one Guild session per candidate with zero cap floods Guild's
  // per-account session queue, so most sit in DISPATCHED past this app's
  // poll window and never get credit for actually completing (confirmed
  // live at 33-candidate scale). mapWithGuildConcurrency keeps a handful in
  // flight at once instead.
  const analyzed: DecisionOutput[] = await mapWithGuildConcurrency(survived, async (s) => ({
    candidate: s.candidate,
    skeptic: s.skeptic,
    decision: await decide(s.candidate),
  }));

  const bySource = analyzed.reduce<Record<string, number>>((acc, a) => {
    acc[a.decision.source] = (acc[a.decision.source] ?? 0) + 1;
    return acc;
  }, {});
  const sourceSummary = Object.entries(bySource)
    .map(([source, count]) => `${count} via ${source}`)
    .join(", ");

  return {
    analyzed,
    trace: {
      agent: "Investment Angle",
      input: { candidateCount: survived.length },
      output: analyzed.map((a) => ({
        startupId: a.candidate.startupId,
        confidence: a.decision.confidence,
        source: a.decision.source,
      })),
      note: `Decided a re-engagement angle for ${survived.length} Skeptic-cleared candidate(s) — ${sourceSummary}. No direct graph, signal-feed, or xAI access — input is exactly what survived Skeptic.`,
    },
  };
}
