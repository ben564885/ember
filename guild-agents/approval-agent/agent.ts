// Real Guild.ai coded agent — see skeptic-agent/agent.ts's header for the
// same deploy caveats (not part of the Next.js build, deploy via the real
// Guild CLI per ../../GUILD_SETUP.md).
//
// Two failed live attempts before this shape, both worth recording so a
// future edit doesn't repeat them:
//   1. `task.ui.prompt(...)` (the typed UserInterfaceService method) fails
//      at runtime for a plain `agent({ run })` — automatically-managed-state
//      — agent: "is an agent with automatically-managed state: it must be
//      compiled in order to use hook functions (ui_prompt)."
//   2. Following that error's own suggested fix, `task.ui_prompt(...)` (a
//      flat hook method, exactly as shown in agent.d.ts's own
//      AutomaticallyManagedStateAgent doc example) fails too: "task.ui_prompt
//      is not a function." That doc example doesn't reflect what a plain
//      `agent()`-declared automatic agent actually gets at runtime (it may
//      describe `llmAgent()`'s own internal tool-calling loop instead).
//
// What actually works, confirmed live: the *self-managed-state* shape
// (`start`/`onToolResults`, `stateSchema`) with the `ask()` helper — the
// one pattern in agent.d.ts that doesn't rely on any dynamically-injected
// task method, only real exported functions (`ask`, `assert`, `output`,
// `pick`). `start` returns `ask(prompt)`, a `ToolCallsResult` that pauses
// the agent until a person replies through Guild's UI; the runtime then
// calls `onToolResults` fresh with the reply, which is why no state needs
// to be threaded through `task.save`/`task.restore` here — everything this
// agent needs (the yes/no reply) arrives directly in `results`.
//
// This is a bonus / fast-follow, not required for the app's live behavior:
// the in-process Approval agent (src/lib/guild/approval.ts) already
// enforces a genuine human-in-the-loop gate — nothing sends without an
// explicit click. Deploying this version additionally proves that gate
// through Guild's own confirmed primitive (ask() + ui_prompt), which
// blocks agent execution until a person responds — directly analogous to
// what approval.ts already does, but enforced by Guild's platform instead
// of this app's in-memory queue.

"use agent";

import { agent, ask, assert, output, userInterfaceTools, type Task } from "@guildai/agents-sdk";
import type { InferToolOutput, TypedToolError, TypedToolResult } from "@guildai/agents-sdk";
import { z } from "zod";

const inputSchema = z.object({
  startupName: z.string(),
  draftMessage: z.string(),
});

const outputSchema = z.object({
  approved: z.boolean(),
});

const stateSchema = z.object({});

// ask()'s TOOLS constraint is the full UserInterfaceToolSet (ui_notify,
// ui_prompt, ui_ping together) — pick()-ing down to just ui_prompt doesn't
// satisfy it, confirmed by tsc, so declare the whole set even though only
// ui_prompt is actually called below.
const tools = userInterfaceTools;
type Tools = typeof tools;

type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;
type State = z.infer<typeof stateSchema>;

async function start(input: Input, task: Task<Tools, State>) {
  // Confirmed live: skipping this and going straight to `ask()` fails on
  // resume with a Zod error ("expected object, received undefined") — the
  // runtime validates saved state against stateSchema when onToolResults
  // is invoked, even for a `z.object({})` schema with nothing to persist.
  await task.save({});
  return ask<Tools>(
    `Approve re-engagement note for ${input.startupName}?\n\n"${input.draftMessage}"\n\nReply "yes" to approve, anything else to reject.`,
  );
}

async function onToolResults(
  results: Array<TypedToolResult<Tools> | TypedToolError<Tools>>,
  _task: Task<Tools, State>,
) {
  assert(results.length === 1);
  const result = results[0];
  assert(result.toolName === "ui_prompt");
  assert(result.type === "tool-result", "ui_prompt call errored instead of returning a reply");
  const { text } = result.output as InferToolOutput<Tools["ui_prompt"]>;
  return output({ approved: text.trim().toLowerCase().startsWith("y") });
}

export default agent({
  identifier: "approval-agent",
  description: "Proves the human-in-the-loop approval gate through Guild's own ask()/ui_prompt primitive. Not wired into the live pipeline — see GUILD_SETUP.md.",
  inputSchema,
  outputSchema,
  stateSchema,
  tools,
  start,
  onToolResults,
});
