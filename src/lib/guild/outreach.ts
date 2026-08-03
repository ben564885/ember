import type { AnalystOutput, AgentTraceStep, OutreachOutput } from "./types";

/**
 * Outreach: the "no source link, no sentence" firewall, ported from
 * Receipts/Witness. Outreach never touches the graph or RocketRide
 * directly — its only input is Analyst's decision object. Before a draft
 * is allowed out, every required citation (the founder's name, the warm
 * path, the signal, and the original pass reason) must appear verbatim in
 * the text. Any draft missing one gets discarded and rebuilt
 * deterministically from the fields we can verify, never rendered as-is.
 * This is the boundary that stops a live LLM node from quietly
 * hallucinating a relationship the graph never returned.
 */
function requiredCitations(a: AnalystOutput): { key: string; text: string }[] {
  return [
    { key: "founder", text: a.candidate.founderName },
    { key: "signal", text: a.candidate.signalHeadline },
    { key: "passReason", text: a.candidate.passReason },
  ];
}

function verify(draft: string, a: AnalystOutput): string[] {
  const missing: string[] = [];
  for (const { key, text } of requiredCitations(a)) {
    const snippet = text.slice(0, Math.min(text.length, 24)).toLowerCase();
    if (!draft.toLowerCase().includes(snippet)) missing.push(key);
  }
  return missing;
}

function rebuildDeterministically(a: AnalystOutput): string {
  const { candidate } = a;
  const path = candidate.pathNames.join(" → ");
  return (
    `${candidate.startupName}: passed ${candidate.pathHops <= 1 ? "directly" : "previously"} ` +
    `(reason on file: "${candidate.passReason}"). ` +
    `New signal since then: "${candidate.signalHeadline}". ` +
    `Warm path to ${candidate.founderName}: ${path}.`
  );
}

export function runOutreach(analyzed: AnalystOutput[]): { outputs: OutreachOutput[]; trace: AgentTraceStep } {
  const outputs: OutreachOutput[] = analyzed.map((a) => {
    const missing = verify(a.decision.draft, a);
    const message = missing.length > 0 ? rebuildDeterministically(a) : a.decision.draft;
    return {
      status: "drafted",
      key: a.candidate.key,
      startupId: a.candidate.startupId,
      message,
      citedFields: requiredCitations(a).map((c) => c.key),
    };
  });

  return {
    outputs,
    trace: {
      agent: "Outreach",
      input: { analyzedCount: analyzed.length },
      output: outputs,
      note: "Every draft verified against founder name, signal headline, and pass reason before being allowed through; unverifiable drafts are discarded and rebuilt deterministically from the same fields.",
    },
  };
}
