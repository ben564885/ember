import { getResurfacedCandidates, type ResurfacedCandidate } from "@/lib/graph/queries";
import { callGuildAgent } from "@/lib/guild-platform/client";
import { getAblationState } from "@/lib/ablation/state";
import type { AgentTraceStep } from "./types";

interface EligibilityAgentOutput {
  summary: string;
}

function isEligibilityAgentOutput(o: unknown): o is EligibilityAgentOutput {
  return !!o && typeof o === "object" && typeof (o as { summary?: unknown }).summary === "string";
}

/**
 * Asks a deployed Guild.ai agent to independently narrate *why* the
 * candidates FalkorDB already returned are eligible — never to decide
 * eligibility itself. The candidate list below is fixed before this ever
 * runs; nothing this returns can add, drop, or reorder a candidate. That's
 * deliberate: eligibility here is enforced by a type-checked Cypher query,
 * not a prompt, and this stays true whether or not Guild is configured —
 * see the module doc on runEligibility for why that boundary matters.
 */
async function explainViaGuild(candidates: ResurfacedCandidate[]): Promise<string | null> {
  if (candidates.length === 0) return null;
  const result = await callGuildAgent(
    "eligibility",
    {
      candidates: candidates.map((c) => ({
        startupName: c.startupName,
        passReason: c.passReason,
        signalHeadline: c.signalHeadline,
        pathHops: c.pathHops,
      })),
    },
    isEligibilityAgentOutput,
  );
  return result?.summary ?? null;
}

/**
 * Eligibility (formerly "Sourcer"): the only agent allowed to touch
 * FalkorDB directly. Returns typed candidate records and nothing else — no
 * prose field exists on its output type, so there is no method by which
 * Eligibility could hand a downstream agent an unsourced claim. The
 * boundary is enforced by the type signature, not a prompt instruction —
 * which is also why the optional Guild.ai call below only *explains* the
 * query's result for the trace, and can't override it: `candidates` is
 * already final by the time explainViaGuild runs, and its return value
 * never touches the returned candidate list, only the trace note.
 *
 * Reads the `time` ablation toggle from ablation/state.ts rather than
 * having it threaded through every caller: with it on, the flagship
 * query's temporal WHERE clause is dropped, so signals that predate their
 * own pass leak back into the candidate list — proof runs the opposite
 * direction from the other ablations (more candidates, not fewer).
 */
export async function runEligibility(): Promise<{ candidates: ResurfacedCandidate[]; trace: AgentTraceStep }> {
  const { ignoreTimePredicate } = getAblationState();
  const candidates = await getResurfacedCandidates(2, { ignoreTimePredicate });
  const guildSummary = await explainViaGuild(candidates);

  const baseNote = ignoreTimePredicate
    ? `Bypass active (ablation toggle): time predicate dropped, so signals that predate their pass are included too. Returned ${candidates.length} candidate(s).`
    : `Read-only FalkorDB access. Returned ${candidates.length} candidate(s) where a pass, a post-pass signal, and a <=2-hop KNOWS path all coincide.`;

  return {
    candidates,
    trace: {
      agent: "Eligibility",
      input: { query: "getResurfacedCandidates()", ignoreTimePredicate },
      output: { count: candidates.length, startupIds: candidates.map((c) => c.startupId), guildSummary: guildSummary ?? undefined },
      note: guildSummary ? `${baseNote} Guild.ai independently narrated the result: "${guildSummary}"` : baseNote,
    },
  };
}
