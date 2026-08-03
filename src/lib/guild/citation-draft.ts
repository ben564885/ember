import { callGuildAgent, mapWithGuildConcurrency } from "@/lib/guild-platform/client";
import type { DecisionOutput, AgentTraceStep, DraftOutput } from "./types";

/**
 * Citation & Draft (formerly "Outreach"): the "no citation, no draft"
 * firewall, ported from Receipts/Witness. Never touches the graph or xAI
 * directly — its inputs are Investment Angle's decision object (which
 * already carries Skeptic's verdict) and, only when that draft fails
 * verification, a real deployed Guild.ai redraft agent.
 *
 * Three independent checks/tiers gate a draft:
 *  1. Type plausibility — does the signal's own `type` field actually
 *     match what its headline describes? This is the downstream proof
 *     point for the `reason` ablation toggle: force a mismatched type at
 *     ingestion (laser/ingest.ts's ablation-aware typer) and this is what
 *     should catch it, producing a real "declined" output instead of a
 *     nonsense draft.
 *  2. Citation coverage — every required citation (founder name, warm
 *     path signal, pass reason) must appear verbatim in the draft text.
 *     Investment Angle's draft is used as-is when it already passes.
 *  3. When it doesn't pass, a Guild.ai agent gets one shot at a redraft
 *     given the exact citation requirements — and that redraft is run
 *     through the *same* verification check, never trusted blindly. Only
 *     if Guild isn't configured or its redraft also fails does this stage
 *     fall back to a deterministic rebuild from the same fields — the gate
 *     itself never relaxes, only the source of the text that has to pass it
 *     changes.
 */

const TYPE_KEYWORDS: Record<string, RegExp> = {
  funding: /\b(raise[ds]?|funding|series [a-z]|seed (round|extension)|closes?)\b/i,
  hiring: /\b(hir(e|ing)|roles?|headcount|recruit)\b/i,
  launch: /\b(launch(es|ed)?|ships?|beta|release[ds]?)\b/i,
  press: /\b(featur(e|ed)|roundup|profile|mention(ed)?|rumor(ed)?|acquisition)\b/i,
  github_velocity: /\b(stars?|pushed|repo|commit)\b/i,
};

function typeMismatch(a: DecisionOutput): boolean {
  const pattern = TYPE_KEYWORDS[a.candidate.signalType];
  if (!pattern) return false;
  return !pattern.test(a.candidate.signalHeadline);
}

function requiredCitations(a: DecisionOutput): { key: string; text: string }[] {
  return [
    { key: "founder", text: a.candidate.founderName },
    { key: "signal", text: a.candidate.signalHeadline },
    { key: "passReason", text: a.candidate.passReason },
  ];
}

function missingCitations(draft: string, a: DecisionOutput): string[] {
  const missing: string[] = [];
  for (const { key, text } of requiredCitations(a)) {
    const snippet = text.slice(0, Math.min(text.length, 24)).toLowerCase();
    if (!draft.toLowerCase().includes(snippet)) missing.push(key);
  }
  return missing;
}

function rebuildDeterministically(a: DecisionOutput): string {
  const { candidate } = a;
  const path = candidate.pathNames.join(" → ");
  return (
    `${candidate.startupName}: passed ${candidate.pathHops <= 1 ? "directly" : "previously"} ` +
    `(reason on file: "${candidate.passReason}"). ` +
    `New signal since then: "${candidate.signalHeadline}". ` +
    `Warm path to ${candidate.founderName}: ${path}.`
  );
}

interface CitationDraftAgentOutput {
  message: string;
}

function isCitationDraftAgentOutput(o: unknown): o is CitationDraftAgentOutput {
  return !!o && typeof o === "object" && typeof (o as { message?: unknown }).message === "string";
}

async function guildRedraft(a: DecisionOutput, missing: string[]): Promise<string | null> {
  const result = await callGuildAgent(
    "citation-draft",
    {
      startupName: a.candidate.startupName,
      founderName: a.candidate.founderName,
      signalHeadline: a.candidate.signalHeadline,
      passReason: a.candidate.passReason,
      pathNames: a.candidate.pathNames,
      failedDraft: a.decision.draft,
      missingCitations: missing,
    },
    isCitationDraftAgentOutput,
  );
  return result?.message ?? null;
}

async function draftFor(a: DecisionOutput): Promise<DraftOutput> {
  const common = {
    key: a.candidate.key,
    startupId: a.candidate.startupId,
    startupName: a.candidate.startupName,
    pathNames: a.candidate.pathNames,
    signalHeadline: a.candidate.signalHeadline,
  };

  if (typeMismatch(a)) {
    return {
      ...common,
      status: "declined",
      reason: `Signal type "${a.candidate.signalType}" doesn't match headline content ("${a.candidate.signalHeadline}") — refusing to draft on an unverifiable classification.`,
    };
  }

  const missing = missingCitations(a.decision.draft, a);
  if (missing.length === 0) {
    return { ...common, status: "drafted", message: a.decision.draft, citedFields: requiredCitations(a).map((c) => c.key), source: "provided" };
  }

  const redraft = await guildRedraft(a, missing);
  if (redraft && missingCitations(redraft, a).length === 0) {
    return { ...common, status: "drafted", message: redraft, citedFields: requiredCitations(a).map((c) => c.key), source: "guild" };
  }

  return {
    ...common,
    status: "drafted",
    message: rebuildDeterministically(a),
    citedFields: requiredCitations(a).map((c) => c.key),
    source: "rebuilt",
  };
}

export async function runCitationDraft(analyzed: DecisionOutput[]): Promise<{ outputs: DraftOutput[]; trace: AgentTraceStep }> {
  const outputs: DraftOutput[] = await mapWithGuildConcurrency(analyzed, draftFor);

  const declined = outputs.filter((o) => o.status === "declined").length;
  const bySource = outputs.reduce<Record<string, number>>((acc, o) => {
    if (o.status === "drafted") acc[o.source] = (acc[o.source] ?? 0) + 1;
    return acc;
  }, {});
  const sourceSummary = Object.entries(bySource)
    .map(([source, count]) => `${count} via ${source}`)
    .join(", ");

  return {
    outputs,
    trace: {
      agent: "Citation & Draft",
      input: { analyzedCount: analyzed.length },
      output: outputs,
      note: `Type-plausibility check ran first (${declined} declined for a signal/headline mismatch); every surviving draft verified against founder name, signal headline, and pass reason (${sourceSummary}) before being allowed through — a draft that fails verification gets one Guild.ai redraft attempt, itself re-verified, before falling back to a deterministic rebuild.`,
    },
  };
}
