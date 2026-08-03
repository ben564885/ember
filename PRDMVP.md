# Ember — PRD + MVP

*"Memory Meets Motion" build. One doc: what it is, why it wins the mandatory-stack requirement, and exactly what shipped.*

## Problem

A VC, accelerator, or studio's deal flow is not a CRM problem — it's a memory problem. Every fund passes on companies that later become fundable again: a new round, a hiring spree, a product launch. Nobody re-checks old passes against new signals, and nobody remembers *why* the door might still be open — a warm path through someone the fund already knows.

Static CRMs store contacts. They don't store the thing that actually matters here: **a pass is not a verdict, it's a timestamped state that a new fact can invalidate.**

## The pitch

**Ember** is a living deal-flow layer. It watches live signals about companies you've already evaluated, and the moment a signal lands *after* a pass, it checks whether you also have a short warm path back into that company through people you know — and if both are true, it surfaces the deal with a drafted re-engagement note, gated behind human approval.

The core query, in one sentence: *startups I passed on, where a signal landed after the pass, and I have a ≤2-hop path to a current founder.* That's a multi-hop graph traversal joined against a temporal predicate — the kind of query a relational schema needs a recursive CTE and a self-join to express, and FalkorDB gives it to us as one Cypher statement.

## Why a graph, provably

The demo's key move: delete one `KNOWS` edge, re-run the query, watch a candidate disappear from the ranked list — not because a score changed, but because the path no longer exists. Restore the edge, it comes back. This is the same proof Witness used for engineering attribution (disable a source, the row is structurally absent) ported to deal flow.

## Mandatory-stack mapping

| Requirement | How Ember uses it |
|---|---|
| **LaserData** — live/streaming ingestion, must provide the signal the agent reacts to | Real HN Algolia + GitHub search API calls, made on every "Pull live signals" click *and* automatically every 90s via a background scheduler (`src/instrumentation.ts` → `src/lib/laser/scheduler.ts`). Sector-keyword matches get written onto the graph as a real signal edge — continuously, not just at seed time. |
| **FalkorDB** — persistent graph memory, Cypher-based | The entire deal-flow graph: founders, startups, orgs, passes, meetings, warm-network edges, signals. The flagship query is a genuine multi-hop traversal joined against a temporal `WHERE`. |
| **RocketRide.ai** — orchestration engine, reads memory and decides the next action | Reads exactly what Sourcer pulled from FalkorDB and decides the re-engagement angle — real project, real `llm_openai` pipeline node, real TypeScript client wiring, real completions **with real answers read back** (see caveat history below), confirmed via RocketRide's own Monitor dashboard. |
| **Guild.ai** — multi-agent coordination | Five agents with boundaries enforced by type signatures, not prompt instructions: Eligibility (read-only graph access) → Skeptic (independent verification, can veto — holds a credential no other agent touches) → Investment Angle (decision, no graph/xAI access) → Citation & Draft (type-plausibility + citation firewall) → Approval (human approval; approving fires a real Slack webhook post — the actual "motion"). Skeptic's verification tries a real deployed Guild.ai Trigger first, then a direct xAI Live Search call, then a deterministic local check — see `GUILD_SETUP.md` for how the Guild tier goes live. |

**Honest caveat, kept up to date rather than swept under the rug:** LaserData's backend (Apache Iggy) is live and reachable in this build, but its transport handshake doesn't complete against a bare OSS Iggy container in this dev environment. Confirmed, not just guessed: LaserData Cloud is a real product with a free tier at [laserdata.cloud](https://laserdata.cloud) — signing up and setting `LASER_CONNECTION_STRING` is the concrete unblock (see README.md). RocketRide's connection is fully live with an API key set, and as of this pass its answer *can* be read back — `PIPELINE_RESULT` was coming back with an empty `result_types` map because the pipeline was only `webhook -> llm_openai` with no terminal node; adding a `response_answers` node (RocketRide's own schema, inspected via `client.getServices()`) fixed it, verified against a live completion. The npm package named `guild-ai` turned out to be an unrelated placeholder — but Guild.ai itself is confirmed real (`app.guild.ai`, `@guildai/cli` on npm, `@guildai/agents-sdk`, a documented `task.ui.prompt()` human-in-the-loop primitive, and a Trigger API for invoking a deployed agent over HTTP). `guild-agents/skeptic-agent/agent.ts` is written against that confirmed SDK shape and ready to deploy — the one blocking step is `guild auth login`, an interactive OAuth flow no headless coding agent can complete, so it's a "one login away" gap the same shape as LaserData's, not an architectural one. Until that login happens, Skeptic runs on its xAI-direct or local-heuristic tier and the status bar says so honestly.

## MVP scope — what's actually built

**In scope, shipped:**
- FalkorDB graph: 7 startups, 10 founders, 7 orgs, a warm-KNOWS network, 8 months of seeded pass/meet history, 9 signals (historical + deliberately-fresh) — plus whatever the live firehose has written on top by demo time
- The flagship resurfacing query, with per-candidate warm-path chain
- Live signal firehose: real HN + GitHub API calls, sector-keyword classifier (word-boundary matched), real graph writes for matches — both on manual click and automatically every 90s in the background, so memory keeps compounding through the session
- 5-agent Guild council: Eligibility → Skeptic (can veto, real Guild trigger / xAI Live Search / local heuristic tiers) → Investment Angle → Citation & Draft (type-plausibility check + citation firewall — discards and deterministically rebuilds or declines any draft that fails either) → Approval
- Human approval queue (Approval) — reject sends nothing; **approve posts the drafted note to a real Slack channel** via `SLACK_WEBHOOK_URL` (honest fallback to "not sent" when unset)
- Four ablation kill switches: `edge` (sever/restore any `KNOWS` edge live), `time` (drop the temporal predicate), `reason` (force a mismatched signal type at ingestion), `skeptik` (bypass Skeptic's veto) — each proves a different layer is load-bearing
- Real Guild.ai agent source (`guild-agents/`), written against the confirmed SDK shape, plus `GUILD_SETUP.md` with the exact deploy commands — the only blocking step is an interactive `guild auth login` this build's coding agent couldn't complete itself
- Full dashboard: status bar (live vs. simulated per integration, with the actual reason on hover, now including Guild/xAI), firehose (now showing auto-tick history too), candidate/approval panel (shows Slack send result and Skeptic verdicts), agent trace, ablation panel, kill-shot panel

**Explicitly out of scope for MVP:**
- Multi-user / multi-fund partitioning — single `Me` node
- A UI graph visualization (force-directed, etc.) — the `/api/graph` snapshot endpoint exists and returns full nodes/edges; rendering it is a fast follow, not required to prove the architecture
- Editing pass/meet history from the UI — seed-only for now
- Actually completing the Guild.ai deploy (`guild auth login` → `guild agent save --publish` → creating a Trigger) — the code and exact commands are ready (`guild-agents/`, `GUILD_SETUP.md`); the interactive login is the one step left for a human

## Demo script (3 minutes)

1. **Seed** — "Reset & seed graph." Eight months of deal-flow history loads in one call.
2. **Run pipeline** — candidates appear, each with a specific citation: the pass reason, the exact signal, the exact warm-path chain. Note the Kelpwork rumor signal getting vetoed by Skeptic — a second, independent agent disagreeing with Eligibility, not another pass-through. Point at the agent trace: five agents, not one model call.
3. **Skeptic kill shot (`skeptik` toggle)** — flip it on, re-run: the same rumor-flavored Kelpwork draft now reaches Approval unchecked. Flip it back, it's vetoed again. This is the proof that the Guild agent council specifically is load-bearing.
4. **Kill shot (`edge`)** — sever `me → Priya Ramaswamy`. Re-run candidates: Ferrylane and Kelpwork both vanish, because both routed through Priya. Restore it, they're back. This is the move that proves FalkorDB is load-bearing.
5. **Live firehose** — "Pull live signals." Real HN/GitHub calls happen on stage; anything matching a tracked sector's keywords writes a real signal onto the graph, live.
5. **Approve** — click reject on one candidate first: nothing happens, that's the gate working. Then click approve on another: a real message lands in Slack live on stage (with `SLACK_WEBHOOK_URL` set) — the human-in-the-loop gate *and* the actual motion, in one click.
