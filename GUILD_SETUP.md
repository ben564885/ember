# Deploying the real Guild.ai agents

Everything in `src/lib/guild/` is real, working, in-process TypeScript — it
already implements the 5-agent council (Eligibility → Skeptic → Investment
Angle → Citation & Draft → Approval) with real type-enforced boundaries.
Each stage now also tries a real deployed Guild.ai agent first, and falls
back to its own local tier only if that agent isn't deployed or the call
fails — same honest-degradation contract used everywhere else in this app.

All five agents in `guild-agents/*/agent.ts` are deployed and live in the
`bnisevich/bnisevich-mmm` workspace as of this writing. What follows is the
exact recipe used to do it, confirmed against the real API (not doc
guesses) — useful if you fork this, redeploy after an agent.ts change, or
add a sixth agent.

**The one thing worth internalizing before touching any of this:** every
agent in a workspace is invoked at the *same* URL
(`/api/workspaces/{owner}/{workspace}/sessions`). It is **not**
agent-specific, despite an earlier version of this doc implying each agent
needed its own "Trigger URL." What's actually agent-specific is the
*credential*: each deployed agent gets its own Guild Trigger, and each
Trigger gets its own API key. The server resolves which agent to run from
*that key*, not from anything in the request body or URL. So: one shared
URL (`GUILD_WORKSPACE_OWNER`/`GUILD_WORKSPACE_NAME`), one API key per agent.

**What each agent actually does once deployed:**

| Agent | Role once live | Can override the local result? |
|---|---|---|
| `eligibility-agent` | Narrates *why* the candidates FalkorDB already returned are eligible, for the trace | **No** — FalkorDB's type-checked Cypher query stays authoritative; this only adds a `note` string |
| `skeptic-agent` | Independently verifies a candidate and can veto it | Yes — its verdict decides `vetoed` |
| `investment-angle-agent` | Decides the re-engagement angle, drafts a first-pass note, rates confidence | Yes — replaces the RocketRide tier when configured |
| `citation-draft-agent` | Gets one redraft attempt, only after Investment Angle's draft fails the citation check | Only the *text*, and only if its redraft *also* passes the same local verification — the firewall itself never moves to Guild |
| `approval-agent` | Proves the human-approval gate through Guild's own `task.ui.prompt()` | **Not wired into the live pipeline at all** — see the note at the bottom |

Two SDK gotchas found by inspecting real errors (not guessed), baked into
every `agent.ts` in `guild-agents/` from the start:
1. `task.console.log` throws at runtime unless the agent explicitly
   declares `consoleTools` in its `tools` — importing `task.console` isn't
   enough on its own.
2. `task.llm.generateText({ prompt })` resolves to `{ text: string }`, not
   a bare string — and that string often arrives wrapped in a ` ```json `
   markdown fence that must be stripped before `JSON.parse`, even though
   the prompt asks for "strict JSON only."

Both are also confirmed directly against `@guildai/agents-sdk`'s own
`.d.ts` files once a scaffolded project's `node_modules` exists
(`node_modules/@guildai/agents-sdk/dist/services/llm.d.ts` and
`task.d.ts`) — worth reading if you're adding a sixth agent or an
agent that needs `task.ui` (see `services/user-interface.d.ts`:
`task.ui.prompt(...)` resolves to `{ type: "text", text: string }`, and
`tools` takes a ToolSet object directly — `tools: userInterfaceTools`, not
`tools: { userInterfaceTools }`).

## 1. Install and log in

```bash
npm i @guildai/cli -g
guild auth login
guild auth status   # confirm you're in
```

## 2. Deploy an agent (repeat per agent)

The same steps work for every agent in `guild-agents/` — substitute the
agent's directory name (`skeptic-agent`, `eligibility-agent`,
`investment-angle-agent`, `citation-draft-agent`, `approval-agent`) each
time. Scaffold *outside* this repo (a sibling directory), since the
scaffold's own `package.json`/`node_modules`/`guild.json` shouldn't live
inside the Next.js app's tree:

```bash
cd ..   # out of this repo
guild agent init --name skeptic-agent --template LLM --agent-type GUILD_TYPESCRIPT --category development
cd skeptic-agent
npm install
cp ../mmm/guild-agents/skeptic-agent/agent.ts ./agent.ts   # same file, just needs to live inside the scaffolded project
npx tsc --noEmit   # typechecks against the real SDK .d.ts files — catches contract mismatches before deploying
```

## 3. Deploy it

```bash
git add -A && git commit -m "Initial implementation"
guild agent save --message "Skeptic: verifies deal-flow signals, can veto" --wait --publish
```

## 4. Add it to the workspace, create a Trigger, and mint that Trigger's API key

```bash
guild workspace agent add bnisevich~skeptic-agent
guild trigger create --type api --agent bnisevich~skeptic-agent
# ^ prints a trigger object with an "id" field — that's <trigger-id> below

guild api POST /triggers/<trigger-id>/api-keys --data '{"name":"ember-app"}'
# ^ prints { "id": "<key-id>", "secret": "gldt_...", ... } — THIS is the
#   credential, not a URL. It's per-trigger; a new agent needs a new one.
```

## 5. Wire it into the app

Add to `.env.local` (see `.env.example` for the full comment):

```bash
GUILD_WORKSPACE_OWNER=<your owner/username>
GUILD_WORKSPACE_NAME=<your workspace name>

# One id/secret pair per agent you've deployed — set only what you have:
GUILD_ELIGIBILITY_API_KEY_ID=<key-id from step 4, eligibility-agent's trigger>
GUILD_ELIGIBILITY_API_KEY_SECRET=<secret from step 4, eligibility-agent's trigger>
GUILD_SKEPTIC_API_KEY_ID=<key-id from step 4, skeptic-agent's trigger>
GUILD_SKEPTIC_API_KEY_SECRET=<secret from step 4, skeptic-agent's trigger>
GUILD_INVESTMENT_ANGLE_API_KEY_ID=<...>
GUILD_INVESTMENT_ANGLE_API_KEY_SECRET=<...>
GUILD_CITATION_DRAFT_API_KEY_ID=<...>
GUILD_CITATION_DRAFT_API_KEY_SECRET=<...>
```

Restart `npm run dev`. The Guild pill in the status bar (`/api/guild/status`)
should flip to "live" as soon as at least one agent's key is configured, and
its detail text says exactly how many of the 5 are (e.g. "2/5 agent trigger
key(s) configured: skeptic, investment-angle"). Each stage's trace note in
the dashboard says which tier actually ran (`via guild`, `via live`/`via
xai`, or `via simulated`/`rebuilt`) — you don't have to deploy all five for
the demo to be honest, only for it to be fully live.

`src/lib/guild-platform/client.ts` implements the session-creation and
polling contract exactly as confirmed above. If the real API ever changes,
the call fails closed — that stage quietly falls back to its next tier
rather than breaking the demo, and the actual error lands in the server log
(`console.error("[guild-platform] <agent> trigger failed:", err)`). That
log line is the fastest way to see exactly what needs adjusting.

## 5b. (Optional) the Approval agent

`guild-agents/approval-agent/agent.ts` proves the human-in-the-loop gate
through Guild's own `ask()`/`ui_prompt` primitive instead of this app's
in-memory queue. Deliberately **not** wired into `runApproval()` in
`src/lib/guild/approval.ts` — doing so would mean every "Run pipeline"
click blocks until a human separately responds inside Guild's own chat UI,
on top of (not instead of) the app's real Approve/Reject buttons, which
already enforce a genuine human gate and are what actually sends to Slack.
It's deployed the same way as the others (steps 2-4 above,
`GUILD_APPROVAL_API_KEY_ID`/`_SECRET`) as a legitimate standalone proof that
Guild's own approval primitive works.

This one took three live iterations to get right, all recorded in the
agent.ts header comment — worth reading before touching it again:
`task.ui.prompt(...)` (the typed service method) and `task.ui_prompt(...)`
(the "hook function" shown in the SDK's own doc example) both fail at
runtime for a plain `agent({ run })` automatic-state agent. What actually
works is the *self-managed-state* shape: `start`/`onToolResults` with the
exported `ask()` helper, plus an explicit `await task.save({})` before
returning `ask(...)` — skip that and it fails on resume with a Zod error
("expected object, received undefined"), because the runtime validates
saved state against `stateSchema` even when there's nothing to persist.

To see it in action, invoke it manually — it genuinely pauses mid-session
waiting for a person, so it takes two calls:

```bash
# 1. Trigger it (same shape as step 5's example, with this agent's key)
curl -X POST https://app.guild.ai/api/workspaces/{owner}/{workspace}/sessions \
  -H "Authorization: Basic $(echo -n '<key-id>:<secret>' | base64)" \
  -H "Content-Type: application/json" \
  -d '{"session_type":"api_trigger","agent_input":{"startupName":"...","draftMessage":"..."}}'
# -> { "id": "<session-id>", ... }

# 2. Reply once it's paused (root_task.status flips DISPATCHED -> STARTED
#    and an EntEventAgentNotificationMessage event appears with the prompt)
guild session send <session-id> --message "yes"
```
