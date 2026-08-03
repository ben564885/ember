# Ember

The living deal-flow layer: a graph that remembers why a deal died, resurfaces it when a new signal lands, and only acts through agents with a human approval gate. Built for the "Memory Meets Motion" mandatory-stack requirement — see [PRDMVP.md](PRDMVP.md) for the product spec and demo script.

## Quick start

```bash
docker compose up -d      # FalkorDB + Apache Iggy + RocketRide engine
npm install
npm run dev                # http://localhost:3000 (or next free port)
```

Open the dashboard, click **Reset & seed graph**, then **Run pipeline**. That's the whole loop.

## What's actually live vs. simulated, and why

Every one of the four mandatory integrations is wired with a **real SDK and real credentials path** — nothing here is a stub pretending to be an integration. FalkorDB and RocketRide's connection are fully live with credentials set; LaserData's transport and RocketRide's answer-content extraction each hit a genuine, documented blocker. Each is detailed below with the exact failure and the exact env var (or missing platform step) that would flip it the rest of the way. The dashboard's status bar shows this live, with the real error message on hover.

### FalkorDB — **live**
Runs in Docker, real Cypher queries, real Redis-protocol client (`falkordb` npm package). No caveats — this one just works.

### LaserData — **simulated** (real SDK, backend wire-incompatible; a real fix is one signup away)
`@laserdata/laser-sdk` is installed and called for real: `Laser.connect()`, `stream().topic()`, `.publish()`, `.replay()`. The SDK pins Apache Iggy `apache-iggy@0.8.1-edge.3` as its transport. Apache Iggy runs in Docker (confirmed reachable at the raw TCP level — `nc` connects fine, and the SDK's own quickstart connection string `iggy:iggy@127.0.0.1:8090` was tried directly against it), but the SDK's connection handshake hangs indefinitely against every OSS Iggy build tried (`:latest`, `:0.8.2-edge.1`, `:edge`). The SDK's own README says it "always constructs a VSR client" with "no protocol option" — that reads as a LaserData-managed wire extension on top of Iggy.

**Confirmed, not guessed:** LaserData Cloud is a real product with a free tier — no card required — at [laserdata.cloud](https://laserdata.cloud), docs at [docs.laserdata.com](https://docs.laserdata.com). Signing up provisions a managed backend and a connection string that, per their docs, is a drop-in replacement — "the SDK and connection string stay the same" across local/cloud/self-hosted. **To go live:** sign up, set `LASER_CONNECTION_STRING` to the string it gives you. `src/lib/laser/client.ts` needs no changes.

Meanwhile, the actual signal *content* is 100% real and now continuous, not just click-triggered: `src/lib/laser/sources.ts` makes genuine live calls to the HN Algolia API and the GitHub public search API, both on every manual "Pull live signals" click and automatically every `FIREHOSE_INTERVAL_MS` (default 90s) via a background scheduler started once from `src/instrumentation.ts` (`src/lib/laser/scheduler.ts`) — no key required for either API. Only the Iggy transport hop between fetch and graph-write degrades to an in-process fallback queue (`src/lib/laser/fallback.ts`) when the real backend isn't reachable; the graph write itself (`insertSignalForStartup`) happens either way and is what actually keeps memory compounding through a live session.

### RocketRide — **fully live**: real connection, real completions, real answers read back

With `ROCKETRIDE_APIKEY` set, `getRocketRideStatus()` reports **live**, and it's real: real project, real `llm_openai` node, real OpenAI key, real completions confirmed via RocketRide's own Monitor dashboard (a genuine `objectId`, a genuine completed task, no errors).

`pipeline.json` was hand-authored three times and wrong three times, each time fixed by inspecting RocketRide's real service schema (`client.getServices()`) instead of guessing from the README:
1. There's no generic `ai_chat` node — each LLM provider is its own node type (`llm_openai`, `anthropic`, etc.), with credentials nested under a named profile (`config.profile` → `config[profile].apikey`), not the flat `{model, apiKey}` shape the README's examples imply.
2. The webhook's output lane is typed `"questions"`, which the SDK only feeds through `client.chat({ token, question })` via a `Question` object — a plain `client.send()` with an arbitrary JSON mimetype silently never reaches the LLM node.
3. **Fixed**: `PIPELINE_RESULT` used to come back with an empty `result_types` map — `{"objectId": "..."}` and nothing else — even though the completion genuinely ran, because the pipeline was only `webhook -> llm_openai` with nothing terminal to receive the model's output. Confirmed via `client.getServices()`: `llm_openai`'s lanes are `{"questions":["answers"]}` and `response_answers` is the terminal node type whose description is literally "returns processed answers back to the requesting client." Added a `response_answers` node wired to `llm_openai_1`'s `answers` lane in `pipeline.json`. Verified against a live completion: `result_types` now reads `{"answers":"answers"}` and `result.answers[0]` carries the real, already-JSON-parsed draft (`angle`/`draft`/`confidence`). `parsePipelineResult()` in `src/lib/rocketride/client.ts` reads `result_types` generically to find the right field rather than hardcoding `"answers"`.

Two other real constraints discovered and fixed along the way:
- **RocketRide only permits one execution of a given pipeline at a time** — confirmed via their Monitor showing 0 running tasks while a "Pipeline is already running" error still fired. The Analyst agent runs candidates concurrently (correct for the local-fallback path), so the live RocketRide call specifically goes through its own queue of concurrency 1 (`withPipelineLock` in `client.ts`) — every candidate still gets a real attempt, just serialized.
- **`client.use()` alone can take longer than a few seconds**, and if an exception happens between `use()` succeeding and the normal cleanup, the orphaned session blocks every subsequent call against that pipeline. Fixed with `try { ... } finally { terminate(); disconnect(); }` and a `ttl: 60` safety net.

**Self-hosting instead of Cloud:** the bundled engine (`ghcr.io/rocketride-org/rocketride-engine`) crash-loops on boot with an upstream `onnxruntime-gpu==1.20.1 unsatisfiable` dependency bug, reproduced across `:latest`, `:3.3.0`, `:3.3.1` — not fixable from this app's side, untested on native linux/amd64 (this is Apple Silicon under emulation).

### Guild — real platform triggers for all five agents, honest fallback for each
The npm package literally named `guild-ai` is an unrelated 355-byte placeholder ("A multi-agent framework for Claude Code") — nothing to do with this hackathon's sponsor product. **Guild.ai is a real hosted product** — "the control plane for AI agents" at [guild.ai](https://www.guild.ai), with a real CLI (`@guildai/cli`, confirmed on npm), a real SDK (`@guildai/agents-sdk`), workspaces, Triggers (invoke a deployed agent over HTTP with a Trigger API key), and a documented human-in-the-loop primitive (`ask()`/`ui_prompt`, which blocks an agent until a person replies).

Five agents — **Eligibility → Skeptic → Investment Angle → Citation & Draft → Approval** — and every one of them is a real deployed Guild.ai agent in `guild-agents/`, live in the `bnisevich/bnisevich-mmm` workspace. All five are invoked at the *same* Trigger URL (`callGuildAgent()` in `src/lib/guild-platform/client.ts` — the URL isn't agent-specific, only the API key is: each agent has its own Guild Trigger and its own Trigger API key, confirmed against the real `POST /triggers/{id}/api-keys` endpoint rather than guessed). `GUILD_SETUP.md` has the exact commands to redeploy any of them (`guild auth login` is the one interactive step no coding agent can do headlessly). What each one actually does once deployed:

- **Eligibility** — narrates *why* the candidates FalkorDB already returned are eligible, for the trace only. Can't override the query: eligibility is enforced by a type-checked Cypher statement, not a prompt, deliberately.
- **Skeptic** — independently verifies a candidate and can **veto** it before Investment Angle ever runs. That's real disagreement in the trace, not another pass-through. Tries, in order: **`guild`** (deployed agent) → **`xai`** (direct xAI Live Search call, `src/lib/guild-platform/xai.ts`, set `XAI_API_KEY`) → **`simulated`** (deterministic local heuristic — checks the headline for rumor-flavored language; the seeded Kelpwork "rumored... unconfirmed" signal is built to trip this exact check).
- **Investment Angle** — decides the re-engagement angle, drafts a first-pass note, rates confidence. Tries **`guild`** first, then RocketRide's own live/simulated tiers.
- **Citation & Draft** — the "no citation, no draft" firewall stays 100% local and deterministic; a draft only reaches Guild for a redraft attempt *after* it fails the local citation check once, and that redraft is re-verified by the same check before being trusted — never blindly.
- **Approval** — keeps its own genuine human-in-the-loop gate in-process (`src/lib/guild/approval.ts`) — nothing sends without an explicit click, already true before any of this. `guild-agents/approval-agent/agent.ts` is a real Guild agent version of the same gate via `ask()`/`ui_prompt`, deliberately **not** wired into the live pipeline (it would block "Run pipeline" on a second, separate human response inside Guild's own chat UI) — an optional standalone deployment target in `GUILD_SETUP.md`, not required for the app's live behavior.

## Architecture

```
LaserData (real fetch, sim transport, continuous) → FalkorDB (real graph) → RocketRide (live connection, live content) → Guild agent council (5 agents, each: real trigger / stage-specific fallback tiers) → External Tools/APIs (Slack) → UI
```

- `src/lib/graph/` — FalkorDB client, schema, seed data, and the flagship Cypher query (with the `time`-ablation-aware predicate toggle)
- `src/lib/laser/` — live signal sources (HN, GitHub), the Laser client with honest fallback, and the `reason`-ablation-aware typer
- `src/lib/rocketride/` — the real `.pipe` config, client, and local decision fallback
- `src/lib/guild/` — the five agents (Eligibility, Skeptic, Investment Angle, Citation & Draft, Approval) and the orchestrator
- `src/lib/guild-platform/` — the real Guild.ai Trigger client and the direct xAI Live Search client Skeptic calls into
- `src/lib/ablation/` — the in-memory state backing the `time` / `reason` / `skeptik` ablation toggles
- `guild-agents/` — real Guild.ai coded agents, deployed separately via the Guild CLI (see `GUILD_SETUP.md`) — not part of this Next.js app's build
- `src/app/api/` — one route per integration boundary
- `src/components/` — the dashboard (status bar, firehose, pipeline runner, ablation panel, kill-shot panel)

## The flagship query

```cypher
MATCH (me:Me)-[passed:PASSED_ON]->(s:Startup)-[:HAD_SIGNAL]->(sig:Signal)
WHERE sig.timestamp > passed.date
MATCH (s)<-[:FOUNDED]-(f:Founder)
MATCH path = (me)-[:KNOWS*1..2]-(f)
RETURN s, sig, f, passed, length(path) AS hops
ORDER BY sig.timestamp DESC, hops ASC
```

Startups passed on, where a signal landed after the pass, where a ≤2-hop warm path exists to a current founder. One Cypher statement; the relational equivalent needs a self-join on an edge table plus a recursive CTE for the path.

## The five agents

| Agent | Boundary |
|---|---|
| **Eligibility** | Only agent with FalkorDB access. Returns typed candidates — no prose field exists on its output type. |
| **Skeptic** | Independently verifies each candidate (Guild trigger → xAI Live Search → local heuristic) and can **veto** it. Holds the xAI credential no other agent imports. The only agent that can override Eligibility's output instead of relaying it — real disagreement, not another pass-through. |
| **Investment Angle** | Takes exactly what survived Skeptic, asks RocketRide to decide. No direct graph, signal-feed, or xAI access — "packet only, no tools." |
| **Citation & Draft** | Two gates: a type-plausibility check (does the signal's `type` actually match its headline?) and the citation firewall (founder name, signal, pass reason must all appear verbatim). Either failure discards the draft — a type mismatch produces a real `declined` output, a missing citation gets rebuilt deterministically from the same fields. Never rendered unverified. |
| **Approval** | Human approval queue. Reject sends nothing. Approve does: posts the drafted note to Slack via `SLACK_WEBHOOK_URL` (`src/lib/slack/notify.ts`) — the one place in the app with a genuine external side effect, gated behind the human click. Unset, it degrades honestly to "not sent" rather than pretending. |

## The kill shots

Four ablation switches, each proving a different layer is load-bearing rather than decorative:

- **`edge`** (kill-shot panel) — sever any `KNOWS` edge, then re-run the pipeline. Any candidate whose only path ran through that edge disappears — not because a score changed, but because the path no longer exists in FalkorDB. Restore it, it's back.
- **`time`** (ablation panel) — drops the flagship query's `sig.timestamp > passed.date` predicate. Proof runs the opposite direction from the others: the candidate count should *increase*, since stale signals leak back in.
- **`reason`** (ablation panel) — forces every newly-ingested live signal to carry a deliberately wrong type. Pull live signals with it on, re-run: Citation & Draft's type-plausibility check should decline the mismatched one.
- **`skeptik`** (ablation panel) — bypasses Skeptic's veto. With it on, the seeded rumor-flavored Kelpwork signal reaches Approval unchecked instead of being blocked. This is the one that proves the Guild agent council specifically is load-bearing.

## Environment variables

| Var | Effect when set |
|---|---|
| `LASER_CONNECTION_STRING` | Points LaserData at a real managed backend instead of the local fallback queue — get one free at [laserdata.cloud](https://laserdata.cloud) |
| `FIREHOSE_INTERVAL_MS` | How often the background scheduler pulls HN/GitHub and writes matches onto the graph (default: `90000`) |
| `ROCKETRIDE_URI` | Points RocketRide at a working self-hosted engine (default: `ws://localhost:5565`) |
| `ROCKETRIDE_APIKEY` | Connects RocketRide to Cloud instead of self-hosted — this genuinely works, including reading real answers back |
| `OPENAI_API_KEY` | Injected into `pipeline.json`'s `llm_openai` node at call time, never written to that file — needed for RocketRide's completion to run at all |
| `SLACK_WEBHOOK_URL` | A Slack Incoming Webhook URL — makes Approval's approve() actually post the drafted note to a real Slack channel |
| `XAI_API_KEY` | Makes Skeptic call xAI's Live Search API for real instead of the local heuristic |
| `GUILD_WORKSPACE_OWNER` / `GUILD_WORKSPACE_NAME` | The one shared invocation URL every agent in the workspace uses — it is not agent-specific, only the API key is |
| `GUILD_ELIGIBILITY_API_KEY_ID` / `_SECRET`, `GUILD_SKEPTIC_API_KEY_ID` / `_SECRET`, `GUILD_INVESTMENT_ANGLE_API_KEY_ID` / `_SECRET`, `GUILD_CITATION_DRAFT_API_KEY_ID` / `_SECRET`, `GUILD_APPROVAL_API_KEY_ID` / `_SECRET` | Per-agent Trigger API key, from `guild api POST /triggers/{triggerId}/api-keys` — set only the ones you've deployed; see `GUILD_SETUP.md` |
| `GUILD_API_KEY_ID` / `GUILD_API_KEY_SECRET` | Legacy alias for `GUILD_SKEPTIC_API_KEY_ID`/`_SECRET` specifically, kept so an already-issued Skeptic key needs no changes |
| `GUILD_TRIGGER_URL` | Override for the shared session URL itself, if `app.guild.ai`'s shape ever changes |
| `FALKORDB_HOST` / `FALKORDB_PORT` | Override FalkorDB connection (defaults: `127.0.0.1:6379`) |

None of these are required to run the demo — every integration degrades honestly and the dashboard shows exactly which mode each one is in and why.
