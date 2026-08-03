import { getResurfacedCandidates, type ResurfacedCandidate } from "@/lib/graph/queries";
import type { AgentTraceStep } from "./types";

/**
 * Sourcer: the only agent allowed to touch FalkorDB directly. It returns
 * typed candidate records and nothing else — no prose field exists on its
 * output type, so there is no method by which Sourcer could hand a
 * downstream agent an unsourced claim. The boundary is enforced by the
 * type signature, not by a prompt instruction.
 */
export async function runSourcer(): Promise<{ candidates: ResurfacedCandidate[]; trace: AgentTraceStep }> {
  const candidates = await getResurfacedCandidates();
  return {
    candidates,
    trace: {
      agent: "Sourcer",
      input: { query: "getResurfacedCandidates()" },
      output: { count: candidates.length, startupIds: candidates.map((c) => c.startupId) },
      note: `Read-only FalkorDB access. Returned ${candidates.length} candidate(s) where a pass, a post-pass signal, and a <=2-hop KNOWS path all coincide.`,
    },
  };
}
