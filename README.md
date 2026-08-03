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

### Guild — custom implementation, kept deliberately (real product confirmed, not integrated)
The npm package literally named `guild-ai` is an unrelated 355-byte placeholder ("A multi-agent framework for Claude Code") — nothing to do with this hackathon's sponsor product. That's genuinely misleading, though: **Guild.ai is a real hosted product** — "the control plane for AI agents" at [guild.ai](https://www.guild.ai), with a real CLI (`@guildai/cli`), a real SDK (`@guildai/agents-sdk`), workspaces, and a documented human-in-the-loop primitive (`task.ui.prompt()`, which blocks an agent until a person replies — directly analogous to Gatekeeper here) and agent-to-agent handoff (`task.gather()`). Docs: [docs.guild.ai](https://docs.guild.ai/).

Deliberately not migrated to it for this build: doing so would mean the four specialist agents run as separately published, network-hosted Guild agents invoked over their CLI/API rather than in-process TypeScript — a real architecture change, and a new live dependency during a timed demo, this close to presenting. Guild here stays a custom in-process implementation (`src/lib/guild/`) built to the same spec the mandatory-stack requirement describes: specialist agents, enforced handoffs, human-in-the-loop. See "The four agents" below. Worth migrating as a genuine fast-follow, not a demo-day gamble.

## Architecture

```
LaserData (real fetch, sim transport, continuous) → FalkorDB (real graph) → RocketRide (live connection, live content) → Guild (custom) → External Tools/APIs (Slack) → UI
```

- `src/lib/graph/` — FalkorDB client, schema, seed data, and the flagship Cypher query
- `src/lib/laser/` — live signal sources (HN, GitHub), the Laser client with honest fallback
- `src/lib/rocketride/` — the real `.pipe` config, client, and local decision fallback
- `src/lib/guild/` — the four agents and the orchestrator
- `src/app/api/` — one route per integration boundary
- `src/components/` — the dashboard (status bar, firehose, pipeline runner, kill-shot panel)

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

## The four agents

| Agent | Boundary |
|---|---|
| **Sourcer** | Only agent with FalkorDB access. Returns typed candidates — no prose field exists on its output type. |
| **Analyst** | Takes exactly Sourcer's output, asks RocketRide to decide. No direct graph or signal-feed access. |
| **Outreach** | The citation firewall: verifies every draft cites the founder name, the signal, and the pass reason. Anything missing a citation is discarded and rebuilt deterministically from the same fields — never rendered as-is. |
| **Gatekeeper** | Human approval queue. Reject sends nothing. Approve does: posts the drafted note to Slack via `SLACK_WEBHOOK_URL` (`src/lib/slack/notify.ts`) — the one place in the app with a genuine external side effect, gated behind the human click. Unset, it degrades honestly to "not sent" rather than pretending. |

## The kill shot

Sever any `KNOWS` edge in the dashboard's kill-shot panel, then re-run the pipeline. Any candidate whose only path ran through that edge disappears from the ranked list — not because a score changed, but because the path no longer exists in FalkorDB. Restore the edge, it's back. This is the single move that proves the graph is load-bearing rather than decorative.

## Environment variables

| Var | Effect when set |
|---|---|
| `LASER_CONNECTION_STRING` | Points LaserData at a real managed backend instead of the local fallback queue — get one free at [laserdata.cloud](https://laserdata.cloud) |
| `FIREHOSE_INTERVAL_MS` | How often the background scheduler pulls HN/GitHub and writes matches onto the graph (default: `90000`) |
| `ROCKETRIDE_URI` | Points RocketRide at a working self-hosted engine (default: `ws://localhost:5565`) |
| `ROCKETRIDE_APIKEY` | Connects RocketRide to Cloud instead of self-hosted — this genuinely works, including reading real answers back |
| `OPENAI_API_KEY` | Injected into `pipeline.json`'s `llm_openai` node at call time, never written to that file — needed for RocketRide's completion to run at all |
| `SLACK_WEBHOOK_URL` | A Slack Incoming Webhook URL — makes Gatekeeper's approve() actually post the drafted note to a real Slack channel |
| `FALKORDB_HOST` / `FALKORDB_PORT` | Override FalkorDB connection (defaults: `127.0.0.1:6379`) |

None of these are required to run the demo — every integration degrades honestly and the dashboard shows exactly which mode each one is in and why.
