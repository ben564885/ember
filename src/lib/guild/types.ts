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
  /** `source` widens PipelineRunResult's own "live"|"simulated" with "guild" — the tier Investment Angle tries before ever reaching RocketRide. */
  decision: Omit<PipelineRunResult, "source"> & { source: PipelineRunResult["source"] | "guild" };
}

interface DraftOutputCommon {
  key: string;
  startupId: string;
  startupName: string;
  pathNames: string[];
  signalHeadline: string;
}

export type DraftOutput =
  | (DraftOutputCommon & {
      status: "drafted";
      message: string;
      citedFields: string[];
      /** Where `message` actually came from: Investment Angle's own draft as-is, a Guild redraft after the citation check failed once, or this stage's own deterministic rebuild. */
      source: "provided" | "guild" | "rebuilt";
    })
  | (DraftOutputCommon & { status: "declined"; reason: string });

export interface ApprovalEntry {
  key: string;
  startupId: string;
  startupName: string;
  pathNames: string[];
  signalHeadline: string;
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
