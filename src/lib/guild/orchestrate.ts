import { runEligibility } from "./eligibility";
import { runSkeptic } from "./skeptic";
import { runInvestmentAngle } from "./investment-angle";
import { runCitationDraft } from "./citation-draft";
import { runApproval } from "./approval";
import type { AgentTraceStep, ApprovalEntry, SkepticOutput } from "./types";

export interface OrchestrationResult {
  queued: ApprovalEntry[];
  vetoed: SkepticOutput[];
  trace: AgentTraceStep[];
}

/** Runs the full Eligibility -> Skeptic -> Investment Angle -> Citation & Draft -> Approval chain once. */
export async function runFullPipeline(): Promise<OrchestrationResult> {
  const trace: AgentTraceStep[] = [];

  const { candidates, trace: eligibilityTrace } = await runEligibility();
  trace.push(eligibilityTrace);

  const { survived, vetoed, trace: skepticTrace } = await runSkeptic(candidates);
  trace.push(skepticTrace);

  const { analyzed, trace: investmentTrace } = await runInvestmentAngle(survived);
  trace.push(investmentTrace);

  const { outputs, trace: draftTrace } = await runCitationDraft(analyzed);
  trace.push(draftTrace);

  const { queued, trace: approvalTrace } = runApproval(outputs);
  trace.push(approvalTrace);

  return { queued, vetoed, trace };
}
