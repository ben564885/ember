import type { ResurfacedCandidate } from "@/lib/graph/queries";
import type { PipelineRunResult } from "@/lib/rocketride/client";

export interface AnalystOutput {
  candidate: ResurfacedCandidate;
  decision: PipelineRunResult;
}

export type OutreachOutput =
  | { status: "drafted"; key: string; startupId: string; message: string; citedFields: string[] }
  | { status: "declined"; key: string; startupId: string; reason: string };

export interface GatekeeperOutput {
  key: string;
  startupId: string;
  approvalStatus: "pending" | "approved" | "rejected";
  message: string | null;
  motion?: { mode: "live" | "simulated"; detail: string };
}

export interface AgentTraceStep {
  agent: "Sourcer" | "Analyst" | "Outreach" | "Gatekeeper";
  input: unknown;
  output: unknown;
  note: string;
}
