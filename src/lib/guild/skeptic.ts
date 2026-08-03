import type { ResurfacedCandidate } from "@/lib/graph/queries";
import { callGuildAgent, mapWithGuildConcurrency } from "@/lib/guild-platform/client";
import { verifySignalOnX } from "@/lib/guild-platform/xai";
import { getAblationState } from "@/lib/ablation/state";
import type { AgentTraceStep, SkepticOutput, SkepticVerdict } from "./types";

const RUMOR_LANGUAGE = /\brumor(ed)?\b|\bunconfirmed\b|\balleged(ly)?\b|\bspeculat/i;

interface SkepticAgentOutput {
  verdict: "confirmed" | "rumor";
  reasoning: string;
}

function isSkepticAgentOutput(o: unknown): o is SkepticAgentOutput {
  return !!o && typeof o === "object" && ((o as { verdict?: unknown }).verdict === "confirmed" || (o as { verdict?: unknown }).verdict === "rumor");
}

/**
 * Deterministic bottom tier: no network dependency, always available. Real
 * fictional demo startups will genuinely have zero public chatter, so
 * "nothing found" can't be the veto signal — this checks whether the
 * headline itself reads as rumor-flavored instead, which is legible in the
 * trace and demo-reliable regardless of API availability.
 */
function heuristicVerdict(candidate: ResurfacedCandidate): SkepticVerdict {
  const isRumor = RUMOR_LANGUAGE.test(candidate.signalHeadline);
  return {
    verdict: isRumor ? "rumor" : "confirmed",
    reasoning: isRumor
      ? `Headline reads as unverified/rumor language: "${candidate.signalHeadline}".`
      : "No rumor-flavored language in the headline; treated as corroborated.",
    source: "simulated",
  };
}

async function decideVerdict(candidate: ResurfacedCandidate): Promise<SkepticVerdict> {
  const viaGuild = await callGuildAgent(
    "skeptic",
    { startupName: candidate.startupName, headline: candidate.signalHeadline },
    isSkepticAgentOutput,
  );
  if (viaGuild) return { verdict: viaGuild.verdict, reasoning: viaGuild.reasoning, source: "guild" };

  const viaXai = await verifySignalOnX({
    startupName: candidate.startupName,
    headline: candidate.signalHeadline,
  });
  if (viaXai) return { ...viaXai, source: "xai" };

  return heuristicVerdict(candidate);
}

/**
 * Skeptic: the one agent in this pipeline that can override what
 * Eligibility already validated against the graph, rather than just
 * relaying it downstream. Holds the xAI credential — no other file in
 * src/lib/guild imports guild-platform/xai.ts — and tries a real deployed
 * Guild.ai agent first, then a direct xAI Live Search call, then a
 * deterministic local check, in that order (see guild-platform/client.ts
 * and guild-platform/xai.ts for what "real" means at each tier).
 *
 * `bypassSkeptic` is the `skeptik` ablation toggle: every verdict still
 * gets computed and shown in the trace either way, but with the toggle on,
 * nothing actually gets vetoed — a rumor-flavored draft reaches Approval
 * unchecked. That's the demo proof this agent is load-bearing, not
 * decorative: toggle it, watch a candidate that should have been blocked
 * sail through.
 */
export async function runSkeptic(
  candidates: ResurfacedCandidate[],
): Promise<{ results: SkepticOutput[]; survived: SkepticOutput[]; vetoed: SkepticOutput[]; trace: AgentTraceStep }> {
  const { bypassSkeptic } = getAblationState();

  const results: SkepticOutput[] = await mapWithGuildConcurrency(candidates, async (candidate) => {
    const skeptic = await decideVerdict(candidate);
    const vetoed = skeptic.verdict === "rumor" && !bypassSkeptic;
    return { candidate, skeptic, vetoed };
  });

  const survived = results.filter((r) => !r.vetoed);
  const rumorFlagged = results.filter((r) => r.skeptic.verdict === "rumor");

  const bySource = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.skeptic.source] = (acc[r.skeptic.source] ?? 0) + 1;
    return acc;
  }, {});
  const sourceSummary = Object.entries(bySource)
    .map(([source, count]) => `${count} via ${source}`)
    .join(", ");

  return {
    results,
    survived,
    vetoed: rumorFlagged,
    trace: {
      agent: "Skeptic",
      input: { candidateCount: candidates.length },
      output: results.map((r) => ({
        key: r.candidate.key,
        startupId: r.candidate.startupId,
        verdict: r.skeptic.verdict,
        source: r.skeptic.source,
        vetoed: r.vetoed,
      })),
      note: bypassSkeptic
        ? `Bypass active (ablation toggle): ${rumorFlagged.length} rumor-flagged candidate(s) let through unchecked. Verdicts: ${sourceSummary}.`
        : `Independently verified ${candidates.length} candidate(s) — ${sourceSummary}. Vetoed ${rumorFlagged.length}.`,
    },
  };
}
