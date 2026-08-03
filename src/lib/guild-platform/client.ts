// Real Guild.ai platform client — a generic trigger caller used by every
// stage in src/lib/guild/ that wants a real deployed Guild agent as its top
// tier (Guild trigger -> stage-specific local fallback; see each stage file
// for its own chain). This is the piece that actually calls out to
// app.guild.ai instead of staying in-process TypeScript, which is the gap
// the rest of this app's Guild "agents" don't close on their own.
//
// Confirmed live against a real Guild workspace (bnisevich/bnisevich-mmm) by
// deploying and invoking eligibility-agent end-to-end — this is the actual
// contract, not a doc guess. The one thing worth calling out because it's
// easy to get backwards: the invocation URL is NOT agent-specific. Every
// agent in a workspace is invoked at the exact same URL
// (`/api/workspaces/{owner}/{workspace}/sessions`) — what's agent-specific
// is the *credential*. Each Guild Trigger gets its own API key
// (`POST /api/triggers/{triggerId}/api-keys`, confirmed live — NOT
// `/trigger-api-keys` as an earlier version of this file's setup docs
// guessed), and the server resolves which agent to run from *that key*,
// not from anything in the request body or URL. So: one shared URL, one
// API key per agent. See GUILD_SETUP.md.
//
// 1. POST to the shared workspace-sessions URL with HTTP Basic auth (that
//    agent's own Trigger API key, `id:secret`, base64-encoded) and body
//    `{ session_type: "api_trigger", agent_input: {...} }` (session_type is
//    required by the server but its value isn't otherwise validated).
//    Returns 201 with `{ id, root_task: { status: "DISPATCHED" }, ... }` —
//    note the field is `id`, not `session_id`.
//
// 2. Poll `/api/sessions/{sessionId}` (top-level — NOT nested under
//    `/workspaces/{...}/sessions/{id}`, which 404s/401s) with the same Basic
//    auth. Status lives at `root_task.status`, values are uppercase
//    (DISPATCHED, STARTED, DONE, ERROR) — not "completed"/"failed".
//
// 3. Once `root_task.status === "DONE"`, the agent's return value is NOT on
//    the session object itself. Fetch
//    `/api/sessions/{sessionId}/events?types=runtime_done` (same Basic auth)
//    and look at the `EntEventRuntimeDone` events' `content`. There can be
//    more than one (e.g. one per tool call the agent made, like
//    `task.console.log` acking `{result:"ok"}`) — the real output is
//    whichever event's content actually matches the agent's output schema,
//    which is why callGuildAgent takes a type guard rather than assuming
//    the first event is the right one.
//
// Every network call below fails closed to null on any mismatch — same
// honest-degradation contract as rocketride/client.ts and laser/client.ts —
// so a wrong guess (or a future contract change, or an agent that was never
// deployed) just means that stage quietly falls back to its next tier, not
// a broken demo.

import { FORCE_SIMULATED_TIERS } from "@/lib/demo-speed";

export type GuildPlatformMode = "live" | "simulated";

/**
 * Runs `fn` over `items` with at most 5 in flight at once. Guild's session
 * queue has a real per-account concurrency limit — confirmed live by
 * firing 33 concurrent investment-angle sessions in one pipeline run: 22
 * sat in DISPATCHED well past this client's 20s poll window even though
 * every one of them eventually completed. Bounding concurrency here means
 * more candidates get a genuine Guild answer inside the poll window instead
 * of timing out into the local-fallback tier just from being queued behind
 * dozens of siblings — callGuildAgent's own honest-degradation behavior
 * (fall back to null on timeout) is unaffected either way, this just makes
 * "live" the common case instead of the rare one under real candidate
 * counts.
 */
export async function mapWithGuildConcurrency<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const limit = 5;
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * One entry per stage in the council (see guild/types.ts's AgentTraceStep).
 * Each deployed agent gets its own Trigger API key — see
 * API_KEY_ENV_PREFIX below and .env.example / GUILD_SETUP.md for the
 * deploy steps per agent.
 */
export type GuildAgentName = "eligibility" | "skeptic" | "investment-angle" | "citation-draft" | "approval";

const ALL_AGENTS: GuildAgentName[] = ["eligibility", "skeptic", "investment-angle", "citation-draft", "approval"];

const API_KEY_ENV_PREFIX: Record<GuildAgentName, string> = {
  eligibility: "GUILD_ELIGIBILITY",
  skeptic: "GUILD_SKEPTIC",
  "investment-angle": "GUILD_INVESTMENT_ANGLE",
  "citation-draft": "GUILD_CITATION_DRAFT",
  approval: "GUILD_APPROVAL",
};

/**
 * The one URL every agent in the workspace shares — see the module header
 * for why this is NOT agent-specific. `GUILD_TRIGGER_URL` is an override
 * (e.g. if app.guild.ai's URL shape ever changes) that applies to every
 * agent equally, same reasoning.
 */
function sessionsUrl(): string | null {
  if (process.env.GUILD_TRIGGER_URL) return process.env.GUILD_TRIGGER_URL;
  const owner = process.env.GUILD_WORKSPACE_OWNER;
  const workspace = process.env.GUILD_WORKSPACE_NAME;
  if (!owner || !workspace) return null;
  return `https://app.guild.ai/api/workspaces/${owner}/${workspace}/sessions`;
}

function authHeader(agentName: GuildAgentName): string | null {
  const prefix = API_KEY_ENV_PREFIX[agentName];
  let id = process.env[`${prefix}_API_KEY_ID`];
  let secret = process.env[`${prefix}_API_KEY_SECRET`];

  // Legacy fallback: the original single-agent setup (before this app had
  // more than one deployed agent) used unprefixed GUILD_API_KEY_ID/SECRET
  // for Skeptic specifically. Kept so an already-issued Skeptic key keeps
  // working with zero env changes.
  if (agentName === "skeptic") {
    id = id ?? process.env.GUILD_API_KEY_ID;
    secret = secret ?? process.env.GUILD_API_KEY_SECRET;
  }

  if (!id || !secret) return null;
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

/**
 * Reports how many of the 5 council agents actually have a real Trigger API
 * key configured, not just whether Skeptic (the first one deployed) does —
 * "live" as soon as the shared URL and at least one agent's key are
 * present, since that's already a genuine Guild.ai network dependency, but
 * the detail string says exactly how many of the 5 are wired so it's never
 * overstated as "the council is on Guild" when only Skeptic is.
 */
export async function getGuildPlatformStatus(): Promise<{ mode: GuildPlatformMode; detail: string }> {
  const url = sessionsUrl();
  if (!url) {
    return { mode: "simulated", detail: "no GUILD_WORKSPACE_OWNER/GUILD_WORKSPACE_NAME (or GUILD_TRIGGER_URL) set" };
  }

  const configured = ALL_AGENTS.filter((a) => authHeader(a) !== null);
  if (configured.length === 0) {
    return { mode: "simulated", detail: "workspace URL set but no agent Trigger API keys configured (see GUILD_SETUP.md)" };
  }

  return {
    mode: "live",
    detail: `${configured.length}/${ALL_AGENTS.length} agent trigger key(s) configured: ${configured.join(", ")}`,
  };
}

async function pollSession(apiOrigin: string, auth: string, sessionId: string): Promise<unknown[] | null> {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const res = await fetch(`${apiOrigin}/sessions/${sessionId}`, { headers: { Authorization: auth } });
    if (!res.ok) return null;
    const data = (await res.json()) as { root_task?: { status?: string } };
    const status = (data.root_task?.status ?? "").toUpperCase();
    if (status === "DONE") {
      const eventsRes = await fetch(`${apiOrigin}/sessions/${sessionId}/events?types=runtime_done`, {
        headers: { Authorization: auth },
      });
      if (!eventsRes.ok) return null;
      const eventsData = (await eventsRes.json()) as { items?: Array<{ content?: unknown }> };
      return (eventsData.items ?? []).map((item) => item.content);
    }
    if (status === "ERROR") return null;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

/**
 * Invokes a deployed Guild agent over its real Trigger. Returns null (not a
 * thrown error) for "not configured yet" and "configured but the call/shape
 * didn't work" alike — both collapse into the same local-fallback tier in
 * whichever guild/*.ts stage called this, which is the honest behavior
 * whether the cause is a missing env var or a guessed-wrong output shape.
 *
 * `isValidOutput` is a type guard rather than a fixed schema because each
 * agent's output shape differs (Skeptic returns a verdict, Investment Angle
 * returns an angle/draft/confidence, etc.) — see each guild/*.ts stage for
 * its own guard.
 */
export async function callGuildAgent<Out>(
  agentName: GuildAgentName,
  input: Record<string, unknown>,
  isValidOutput: (o: unknown) => o is Out,
): Promise<Out | null> {
  if (FORCE_SIMULATED_TIERS) return null;

  const url = sessionsUrl();
  const auth = authHeader(agentName);
  if (!url || !auth) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({ session_type: "api_trigger", agent_input: input }),
    });
    if (!res.ok) throw new Error(`trigger POST returned ${res.status}`);

    const created = (await res.json()) as { session_id?: string; id?: string };
    const sessionId = created.session_id ?? created.id;
    if (!sessionId) throw new Error("trigger response had no session_id");

    const apiOrigin = new URL(url).origin + "/api";
    const outputs = await pollSession(apiOrigin, auth, sessionId);
    if (!outputs) throw new Error("session did not complete with a readable output");

    const parsed = outputs.find(isValidOutput);
    if (!parsed) {
      throw new Error(`unexpected output shape from Guild session (${agentName}): ${JSON.stringify(outputs)}`);
    }
    return parsed;
  } catch (err) {
    console.error(`[guild-platform] ${agentName} trigger failed:`, err);
    return null;
  }
}
