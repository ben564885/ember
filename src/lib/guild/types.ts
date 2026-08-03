import type { ResurfacedCandidate } from "@/lib/graph/queries";
import type { PipelineRunResult } from "@/lib/rocketride/client";

/**
 * Skeptic's independent verdict on a candidate, before Investment Angle
 * ever runs. `source` records where the verdict actually came from — the
 * same honest-degradation contract as every other integration in this app:
 * "guild" (real Guild.ai trigger call), "xai" (direct xAI Live Search call,
 * used when no Guild trigger is configured yet), or "simulated"
 * (deterministic local heuristic, used when neither is reachable).
 */
export interface SkepticVerdict {
  verdict: "confirmed" | "rumor";
  reasoning: string;
  source: "guild" | "xai" | "simulated";
}

export interface SkepticOutput {
  candidate: ResurfacedCandidate;
  skeptic: SkepticVerdict;
  vetoed: boolean;
}

export interface DecisionOutput {
  candidate: ResurfacedCandidate;
  skeptic: SkepticVerdict;
  decision: PipelineRunResult;
}

export type DraftOutput =
  | { status: "drafted"; key: string; startupId: string; message: string; citedFields: string[] }
  | { status: "declined"; key: string; startupId: string; reason: string };

export interface ApprovalEntry {
  key: string;
  startupId: string;
  approvalStatus: "pending" | "approved" | "rejected";
  message: string | null;
  motion?: { mode: "live" | "simulated"; detail: string };
}

export interface AgentTraceStep {
  agent: "Eligibility" | "Skeptic" | "Investment Angle" | "Citation & Draft" | "Approval";
  input: unknown;
  output: unknown;
  note: string;
}
