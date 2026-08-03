import type { ResurfacedCandidate } from "@/lib/graph/queries";
import { runPipelineLive, type PipelineRunResult } from "./client";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Local mirror of pipeline.json's `draft` node. Runs only when the real
 * engine isn't reachable (see client.ts). Deliberately template-based, not
 * an LLM call of our own — the point of RocketRide being "simulated" here
 * is that the *orchestration* is stubbed, not that we silently swapped in
 * a different AI provider to paper over it.
 */
function decideLocally(candidate: ResurfacedCandidate): PipelineRunResult {
  const daysSincePass = Math.round((Date.now() - candidate.passDate) / DAY);
  const daysSinceSignal = Math.round((Date.now() - candidate.signalTimestamp) / DAY);
  const path = candidate.pathNames.join(" → ");

  const confidence: PipelineRunResult["confidence"] =
    candidate.pathHops === 1 ? "high" : candidate.pathHops === 2 ? "medium" : "low";

  const angle = `${candidate.signalType} signal, ${daysSinceSignal}d old, via ${path}`;

  const draft =
    `We passed on ${candidate.startupName} ${daysSincePass}d ago (reason: "${candidate.passReason}"). ` +
    `New signal: "${candidate.signalHeadline}" (${daysSinceSignal}d ago). ` +
    `Warm path to ${candidate.founderName}: ${path}. ` +
    `Worth a re-engagement note citing the ${candidate.signalType} signal specifically.`;

  return { angle, draft, confidence, source: "simulated" };
}

export async function decideNextAction(candidate: ResurfacedCandidate): Promise<PipelineRunResult> {
  const live = await runPipelineLive(candidate);
  if (live) return live;
  return decideLocally(candidate);
}
