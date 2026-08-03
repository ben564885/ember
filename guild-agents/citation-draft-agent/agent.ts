// Real Guild.ai coded agent — see skeptic-agent/agent.ts's header for the
// deploy caveats (not part of the Next.js build, deploy via the real Guild
// CLI per ../../GUILD_SETUP.md) and the two live-confirmed fixes baked in
// below (consoleTools declaration, `{ text }` destructure + markdown-fence
// stripping on task.llm.generateText's output).
//
// This is the redraft tier from src/lib/guild/citation-draft.ts — NOT the
// firewall itself. citation-draft.ts's type-plausibility check and its
// verbatim citation check both stay local, deterministic, and always-on;
// this agent is only ever called after Investment Angle's own draft has
// already failed that citation check once, and gets one shot at a redraft
// given the exact fields it missed. Whatever this agent returns still gets
// re-verified by the same local check before it's allowed through — if it
// fails again, citation-draft.ts falls back to its own deterministic
// rebuild. This agent cannot bypass the firewall, only feed it a second
// attempt.

"use agent";

import { type Task, agent, consoleTools } from "@guildai/agents-sdk";
import { z } from "zod";

const inputSchema = z.object({
  startupName: z.string(),
  founderName: z.string(),
  signalHeadline: z.string(),
  passReason: z.string(),
  pathNames: z.array(z.string()),
  failedDraft: z.string(),
  missingCitations: z.array(z.string()),
});

const outputSchema = z.object({
  message: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

async function run(input: Input, task: Task): Promise<Output> {
  task.console.log(`Citation & Draft redrafting for ${input.startupName}, missing: ${input.missingCitations.join(", ")}`);

  const path = input.pathNames.join(" → ");
  const prompt =
    "A prior draft outreach note for a VC deal-flow system failed a citation check — it " +
    "must quote these three fields VERBATIM (exact substring, not paraphrased): the " +
    "founder's name, the signal headline, and the pass reason. Rewrite it as 2-3 sentences " +
    "that include all three exactly as given below. Respond with strict JSON only: " +
    '{"message":"<2-3 sentences>"}.\n\n' +
    `Startup: ${input.startupName}\n` +
    `Founder name (must appear verbatim): "${input.founderName}"\n` +
    `Signal headline (must appear verbatim): "${input.signalHeadline}"\n` +
    `Pass reason (must appear verbatim): "${input.passReason}"\n` +
    `Warm path: ${path}\n` +
    `Previous draft (missing: ${input.missingCitations.join(", ")}): "${input.failedDraft}"`;

  const { text: raw } = await task.llm.generateText({ prompt });
  const jsonText = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonText) as Partial<Output>;

  return { message: parsed.message ?? "(no message returned)" };
}

export default agent({
  identifier: "citation-draft-agent",
  description: "Redrafts an outreach note that failed citation verification, given the exact fields it must quote verbatim.",
  inputSchema,
  outputSchema,
  tools: consoleTools,
  run,
});
