// Real Guild.ai coded agent — see skeptic-agent/agent.ts's header for the
// deploy caveats (not part of the Next.js build, deploy via the real Guild
// CLI per ../../GUILD_SETUP.md) and the two live-confirmed fixes baked in
// below (consoleTools declaration, `{ text }` destructure + markdown-fence
// stripping on task.llm.generateText's output).
//
// This is Eligibility from src/lib/guild/eligibility.ts, but narrower on
// purpose: Eligibility's actual eligibility decision is a type-checked
// Cypher query against FalkorDB (a private, likely-local database Guild's
// remote runtime has no route to) — that boundary is deliberately NOT an
// LLM's call, so this agent doesn't make it one. It receives the candidate
// list *after* FalkorDB has already decided who's eligible, and its only
// job is to independently narrate why, for the trace. Its output can never
// add, drop, or reorder a candidate — eligibility.ts's `candidates` array
// is fixed before this agent is ever called and this agent's return value
// only feeds a `note` string.

"use agent";

import { type Task, agent, consoleTools } from "@guildai/agents-sdk";
import { z } from "zod";

const inputSchema = z.object({
  candidates: z.array(
    z.object({
      startupName: z.string(),
      passReason: z.string(),
      signalHeadline: z.string(),
      pathHops: z.number(),
    }),
  ),
});

const outputSchema = z.object({
  summary: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

async function run(input: Input, task: Task): Promise<Output> {
  task.console.log(`Eligibility narrating ${input.candidates.length} candidate(s) already returned by FalkorDB`);

  const prompt =
    "A VC deal-flow system already used a graph query to decide these startups are " +
    "eligible to resurface: each was passed on before, has a new signal since the pass, " +
    "and has a <=2-hop warm path to a current founder. You are NOT deciding eligibility — " +
    "that already happened. Write one or two sentences summarizing, for a human reading a " +
    "trace log, what makes this batch notable (e.g. a short warm path, an old pass, a " +
    "cluster in one sector). Respond with strict JSON only: {\"summary\":\"<1-2 sentences>\"}.\n\n" +
    `Candidates: ${JSON.stringify(input.candidates)}`;

  const { text: raw } = await task.llm.generateText({ prompt });
  const jsonText = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonText) as Partial<Output>;

  return { summary: parsed.summary ?? "(no summary returned)" };
}

export default agent({
  identifier: "eligibility-agent",
  description: "Narrates why a batch of already-graph-verified deal-flow candidates is eligible — never decides eligibility itself.",
  inputSchema,
  outputSchema,
  tools: consoleTools,
  run,
});
