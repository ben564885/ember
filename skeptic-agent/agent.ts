// Real Guild.ai coded agent — NOT part of the Next.js app's build (this
// directory sits outside src/ on purpose). This is source you copy into a
// `guild agent init`-scaffolded project and deploy with the real Guild
// CLI; see ../../GUILD_SETUP.md for the exact commands, since none of this
// can be logged into or deployed by a headless coding agent (guild auth
// login is an interactive OAuth flow).
//
// This is the Skeptic agent from src/lib/guild/skeptic.ts, moved onto
// Guild's actual platform: independently verifies a resurfaced deal-flow
// candidate and can veto it before Investment Angle ever runs. Once
// deployed and given a Trigger + Trigger API key, the Next.js app's
// src/lib/guild-platform/client.ts calls this over HTTP — that's the piece
// that makes "Guild" a real network dependency instead of an in-process
// TypeScript module.
//
// Best-effort against docs.guild.ai's confirmed shapes (agent(), the
// input/output schema pattern, task.llm as "LLM service for text
// generation with tool support") — NOT verified against a live account
// during this build, since no XAI_API_KEY-equivalent Guild credential
// existed yet to test with. `guild agent test` will tell you immediately
// if task.llm's exact method name differs from the guess below; fix it the
// same way pipeline.json's real schema was discovered for RocketRide (see
// the main repo's README.md) — by inspecting the real error, not by
// guessing twice.

"use agent";

import { type Task, agent, consoleTools } from "@guildai/agents-sdk";
import { z } from "zod";

const inputSchema = z.object({
  startupName: z.string(),
  headline: z.string(),
});

const outputSchema = z.object({
  verdict: z.enum(["confirmed", "rumor"]),
  reasoning: z.string(),
});

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

async function run(input: Input, task: Task): Promise<Output> {
  task.console.log(`Skeptic verifying: ${input.startupName} — "${input.headline}"`);

  const prompt =
    "You verify startup deal-flow signals for a VC's deal-flow memory system. " +
    'Judge "rumor" when the headline itself reads as unconfirmed, alleged, or ' +
    "speculative — not merely because you have no way to browse the live web " +
    "for corroboration, since small or early-stage startups often have no " +
    "public chatter at all. Respond with strict JSON only: " +
    '{"verdict":"confirmed"|"rumor","reasoning":"<one sentence>"}.\n\n' +
    `Startup: ${input.startupName}\nHeadline: ${input.headline}`;

  const { text: raw } = await task.llm.generateText({ prompt });
  const jsonText = raw.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  const parsed = JSON.parse(jsonText) as Partial<Output>;

  if (parsed.verdict !== "confirmed" && parsed.verdict !== "rumor") {
    throw new Error(`Skeptic agent got an unparseable verdict: ${raw}`);
  }

  return { verdict: parsed.verdict, reasoning: parsed.reasoning ?? "(no reasoning returned)" };
}

export default agent({
  identifier: "skeptic-agent",
  description:
    "Verifies a resurfaced deal-flow candidate's headline and can veto it as an unconfirmed rumor before Investment Angle runs.",
  inputSchema,
  outputSchema,
  tools: consoleTools,
  run,
});
