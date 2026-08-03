import { runSourcer } from "./sourcer";
import { runAnalyst } from "./analyst";
import { runOutreach } from "./outreach";
import { runGatekeeper } from "./gatekeeper";
import type { AgentTraceStep, GatekeeperOutput } from "./types";

export interface OrchestrationResult {
  queued: GatekeeperOutput[];
  trace: AgentTraceStep[];
}

/** Runs the full Sourcer -> Analyst -> Outreach -> Gatekeeper chain once. */
export async function runFullPipeline(): Promise<OrchestrationResult> {
  const trace: AgentTraceStep[] = [];

  const { candidates, trace: sourcerTrace } = await runSourcer();
  trace.push(sourcerTrace);

  const { analyzed, trace: analystTrace } = await runAnalyst(candidates);
  trace.push(analystTrace);

  const { outputs, trace: outreachTrace } = runOutreach(analyzed);
  trace.push(outreachTrace);

  const { queued, trace: gatekeeperTrace } = runGatekeeper(outputs);
  trace.push(gatekeeperTrace);

  return { queued, trace };
}
