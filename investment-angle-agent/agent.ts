// Real Guild.ai coded agent — see skeptic-agent/agent.ts's header for the
// deploy caveats (not part of the Next.js build, deploy via the real Guild
// CLI per ../../GUILD_SETUP.md) and the two live-confirmed fixes baked in
// below (consoleTools declaration, `{ text }` destructure + markdown-fence
// stripping on task.llm.generateText's output).
//
// This is Investment Angle from src/lib/guild/investment-angle.ts, moved
// onto Guild's actual platform: given exactly what survived Skeptic (a
// candidate object and its verdict, nothing else — no graph, signal-feed,
// or xAI access), decides the re-engagement angle, drafts a first-pass
// outreach note, and rates its own confidence. Once deployed with a
// Trigger + Trigger API key, src/lib/guild-platform/client.ts calls this
// as the first tier — RocketRide (or its local fallback) only runs if this
// isn't configured or the call fails.
//
// Note this agent's draft is not the final word: Citation & Draft
// (citation-draft.ts) verifies every draft — this agent's or RocketRide's
// alike — against founder name, signal headline, and pass reason before
// it's ever allowed through, and rebuilds it deterministically if it
// isn't. This agent should still try to cite them; it just isn't trusted
// blindly if it doesn't.

"use agent";

import { type Task, agent, consoleTools } from "@guildai/agents-sdk";
import { z } from "zod";

const inputSchema = z.object({
  startupName: z.string(),
  sector: z.string(),
  passReason: z.string(),
  signalType: z.string(),
  signalHeadline: z.string(),
  founderName: z.string(),
  pathHops: z.number(),
  pathNames: z.array(z.string()),
});

const outputSchema = z.object({
  angle: z.string(),
  draft: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

async function run(input: Input, task: Task): Promise<Output> {
  task.console.log(`Investment Angle deciding: ${input.startupName}`);

  const path = input.pathNames.join(" → ");
  const prompt =
    "You're the Investment Angle agent for a VC's deal-flow memory system. A startup was " +
    "passed on before, and a new signal just resurfaced it with a warm path to a current " +
    "founder. Decide the re-engagement angle in one short phrase, draft a 2-3 sentence " +
    "outreach note, and rate your confidence high/medium/low based on the signal strength " +
    "and how short the warm path is (1 hop = high, 2 hops = medium/low). The draft MUST " +
    "cite, verbatim: the founder's name, the signal headline, and the original pass reason " +
    "— a downstream verifier discards any draft missing one. Respond with strict JSON only: " +
    '{"angle":"<short phrase>","draft":"<2-3 sentences>","confidence":"high"|"medium"|"low"}.\n\n' +
    `Startup: ${input.startupName} (${input.sector})\n` +
    `Pass reason on file: "${input.passReason}"\n` +
    `New signal (${input.signalType}): "${input.signalHeadline}"\n` +
    `Warm path to ${input.founderName} (${input.pathHops} hop(s)): ${path}`;

  const { text: raw } = await task.llm.generateText({ prompt });
  const jsonText = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonText) as Partial<Output>;

  if (parsed.confidence !== "high" && parsed.confidence !== "medium" && parsed.confidence !== "low") {
    throw new Error(`Investment Angle agent got an unparseable confidence: ${raw}`);
  }

  return {
    angle: parsed.angle ?? "(no angle returned)",
    draft: parsed.draft ?? "(no draft returned)",
    confidence: parsed.confidence,
  };
}

export default agent({
  identifier: "investment-angle-agent",
  description: "Decides the re-engagement angle for a Skeptic-cleared deal-flow candidate, drafts a first-pass outreach note, and rates confidence.",
  inputSchema,
  outputSchema,
  tools: consoleTools,
  run,
});
