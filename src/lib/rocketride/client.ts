import path from "node:path";
import { readFile } from "node:fs/promises";
import type { ResurfacedCandidate } from "@/lib/graph/queries";
import { FORCE_SIMULATED_TIERS } from "@/lib/demo-speed";

// Real `rocketride` npm client, wired to run against either RocketRide
// Cloud (ROCKETRIDE_APIKEY, no ROCKETRIDE_URI set — SDK defaults to
// https://api.rocketride.ai) or a self-hosted engine (ROCKETRIDE_URI set
// explicitly, or the local docker-compose default of ws://localhost:5565
// when neither env var is set).
//
// pipeline.json was hand-authored at first, guessing at their schema from
// the README alone, and it guessed wrong in two ways — both fixed after
// exporting a real pipeline from their visual builder:
//   1. There's no generic "ai_chat" node. Each LLM provider is its own
//      node type (e.g. "llm_openai"), and its config is nested under a
//      named profile (config.profile picks a preset, e.g. "openai-5-2",
//      whose credentials live under config["openai-5-2"].apikey) — not
//      the flat {model, apiKey} shape the README's generic examples imply.
//   2. The webhook's connected lane is typed "questions", which the SDK
//      only feeds through client.chat({ token, question }) using a
//      Question object — not client.send() with an arbitrary JSON
//      mimetype, which is what this file originally used and silently
//      never reached the LLM node correctly.
//
// A third gap, now fixed: PIPELINE_RESULT used to come back with an empty
// result_types map (no field to read the answer from) because the pipeline
// was only webhook -> llm_openai, with nothing terminal to receive the
// model's "answers" lane. Confirmed via getServices(): llm_openai emits on
// lane "answers", and response_answers is the terminal node type whose job
// is exactly "returns processed answers back to the requesting client."
// Added a response_answers_3 node wired to llm_openai_1's answers lane in
// pipeline.json; result_types now reads {"answers":"answers"} and
// result.answers[0] carries the real, already-JSON-parsed draft. Verified
// against a live completion, not just inferred from the schema.
//
// Honest caveat, documented here and in README.md: the self-hosted engine
// image (ghcr.io/rocketride-org/rocketride-engine, tried :latest, :3.3.0,
// :3.3.1) crash-loops on boot with an upstream dependency-resolution bug —
// `onnxruntime-gpu==1.20.1` unsatisfiable in ai/eaas.py's constraint
// solver, reproduced identically across all three tags. Not something
// fixable from this app's side. Point ROCKETRIDE_URI at a host where the
// engine actually boots (a native linux/amd64 machine, or a future fixed
// image), or set ROCKETRIDE_APIKEY for Cloud, and this file runs unchanged.

export type RocketRideMode = "live" | "simulated";

let resolvedMode: RocketRideMode | null = null;
let modeDetail = "";

// If ROCKETRIDE_URI is set explicitly, honor it (self-hosted engine). If
// only an API key is set, omit `uri` entirely so the SDK falls back to its
// own built-in default (CONST_DEFAULT_WEB_CLOUD = https://api.rocketride.ai
// — confirmed in node_modules/rocketride/dist/cjs/constants.js). Only when
// neither is set do we default to the local docker-compose engine — an
// earlier version of this file always defaulted to localhost:5565, which
// meant setting ROCKETRIDE_APIKEY alone silently did nothing.
function resolveConnectionTarget() {
  const apiKey = process.env.ROCKETRIDE_APIKEY;
  const explicitUri = process.env.ROCKETRIDE_URI;
  const uri = explicitUri ?? (apiKey ? undefined : "ws://localhost:5565");
  return { apiKey, uri };
}

async function resolveMode(): Promise<RocketRideMode> {
  if (resolvedMode) return resolvedMode;

  const { apiKey, uri } = resolveConnectionTarget();

  try {
    const { RocketRideClient } = await import("rocketride");
    const client = new RocketRideClient({ auth: apiKey, uri });
    const timeoutMs = 3000;
    const result = await Promise.race([
      client.connect().then(() => ({ ok: true as const })),
      new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: `no connection within ${timeoutMs}ms` }), timeoutMs),
      ),
    ]);

    if (result.ok) {
      resolvedMode = "live";
      modeDetail = `connected to ${uri ?? "https://api.rocketride.ai (SDK default)"}`;
      await client.disconnect();
    } else {
      resolvedMode = "simulated";
      modeDetail = result.reason + ` (uri: ${uri ?? "https://api.rocketride.ai (SDK default)"})`;
    }
  } catch (err) {
    resolvedMode = "simulated";
    modeDetail = err instanceof Error ? err.message : String(err);
  }

  return resolvedMode;
}

export async function getRocketRideStatus(): Promise<{ mode: RocketRideMode; detail: string }> {
  const mode = await resolveMode();
  return { mode, detail: modeDetail };
}

export interface PipelineRunResult {
  angle: string;
  draft: string;
  confidence: "high" | "medium" | "low";
  source: RocketRideMode;
}

// pipeline.json is a template checked into the repo — its apikey field is
// the literal placeholder below, never a real secret. The real key lives
// in .env.local (gitignored) and is substituted in memory, at call time,
// right before the config is handed to the SDK. Real key never touches
// disk inside the repo.
const OPENAI_KEY_PLACEHOLDER = "__OPENAI_API_KEY__";

async function loadPipelineConfig(): Promise<Record<string, unknown>> {
  const filepath = path.join(process.cwd(), "src/lib/rocketride/pipeline.json");
  const raw = await readFile(filepath, "utf-8");
  const withKey = raw.replace(OPENAI_KEY_PLACEHOLDER, process.env.OPENAI_API_KEY ?? "");
  return JSON.parse(withKey);
}

// RocketRide rejects concurrent use() calls against the same pipeline
// definition with "Pipeline is already running" — confirmed via their own
// Monitor dashboard showing 0 running tasks at the time, so this is a
// real-time collision, not a leftover stuck session. analyst.ts runs all
// candidates concurrently (correct for the local-fallback path, which has
// no shared external resource), so the live RocketRide call specifically
// needs its own queue of concurrency 1 — every candidate still gets a
// real attempt, just serialized rather than parallel.
let pipelineQueue: Promise<unknown> = Promise.resolve();
function withPipelineLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = pipelineQueue.then(fn, fn);
  pipelineQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runPipelineOnce(candidate: ResurfacedCandidate): Promise<PipelineRunResult> {
  const { RocketRideClient, Question, Answer } = await import("rocketride");
  const { apiKey, uri } = resolveConnectionTarget();
  const client = new RocketRideClient({ auth: apiKey, uri });
  await client.connect();

  const pipeline = await loadPipelineConfig();
  // PipelineConfig isn't part of rocketride's public type exports (only
  // referenced internally by use()'s signature), so there's no named type
  // to import here — cast the whole options object rather than fight a
  // type we can't name. ttl bounds how long an orphaned run can block
  // subsequent use() calls against the same pipeline if this process
  // crashes or throws before reaching terminate() below.
  const { token } = await client.use({
    pipeline,
    ttl: 60,
  } as unknown as Parameters<typeof client.use>[0]);

  try {
    // The pipeline's entry lane is typed "questions" (confirmed from the
    // real exported config — a plain client.send() with an arbitrary JSON
    // mimetype doesn't land there). .chat() is the SDK method that
    // actually targets that lane, via a Question object.
    const question = new Question({ expectJson: true });
    question.addInstruction(
      "Output format",
      "Return a JSON object with exactly these keys: angle (string), draft (string), confidence ('high'|'medium'|'low'). Cite only facts given in the context below — never invent a relationship, date, or fact not present there.",
    );
    question.addContext({
      startupName: candidate.startupName,
      passReason: candidate.passReason,
      signalHeadline: candidate.signalHeadline,
      signalType: candidate.signalType,
      founderName: candidate.founderName,
      pathNames: candidate.pathNames,
    });
    question.addQuestion(
      "Draft a short re-engagement angle for this resurfaced deal-flow candidate, citing the signal, the pass reason, and the warm path by name.",
    );

    const result = await client.chat({ token, question });
    return parsePipelineResult(result, Answer);
  } finally {
    // Always terminate + disconnect, even if chat() throws — an orphaned
    // "running" session on RocketRide's side blocks every subsequent
    // use() call against this same pipeline definition, which is exactly
    // what happened during testing: one failed run left the pipeline
    // wedged as "already running" for every candidate after it.
    await client.terminate(token).catch(() => {});
    await client.disconnect().catch(() => {});
  }
}

type DraftShape = { angle?: string; draft?: string; confidence?: string };

// pipeline.json now ends in a `response_answers` node (lane "answers", fed
// by llm_openai_1's "answers" output lane — confirmed via getServices():
// llm_openai's lanes are {"questions":["answers"]} and response_answers'
// are {"answers":[]}, i.e. it's the terminal node that returns results to
// the caller). Before this node existed, PIPELINE_RESULT came back with an
// empty result_types map — {"objectId": "..."} and nothing else — even
// though the completion genuinely ran; result_types is the map that says
// which field holds the answer, and there was no field to read. With the
// terminal node wired, result_types now reads {"answers": "answers"} and
// result.answers[0] holds the model's JSON output, already parsed by
// RocketRide's response node (not a raw string needing Answer.parseJson) —
// confirmed against a real completion.
function parsePipelineResult(
  result: unknown,
  AnswerClass: typeof import("rocketride").Answer,
): PipelineRunResult {
  const typed = result as { result_types?: Record<string, string>; answers?: unknown[] } & Record<string, unknown>;
  const field = typed.result_types ? Object.keys(typed.result_types)[0] : "answers";
  const list = typed[field ?? "answers"];
  const first = Array.isArray(list) ? list[0] : list;

  if (first == null) {
    throw new Error("RocketRide returned no content in the field named by result_types");
  }

  let parsed: DraftShape | null = null;
  if (typeof first === "object") {
    parsed = first as DraftShape;
  } else if (typeof first === "string") {
    const answer = new AnswerClass(true);
    answer.setAnswer(first);
    parsed = answer.isJson() ? (answer.getJson() as DraftShape) : { draft: answer.getText() };
  }

  return {
    angle: parsed?.angle ?? "unspecified",
    draft: parsed?.draft ?? (typeof first === "string" ? first : JSON.stringify(first)),
    confidence: (parsed?.confidence as PipelineRunResult["confidence"]) ?? "medium",
    source: "live",
  };
}

/**
 * Runs the real pipeline.json against the engine when reachable. Bounded
 * by a timeout independent of the connect() check above: a reachable
 * server can still hang or error mid-run (bad key, rate limit, model
 * unavailable) and without this, one slow candidate would hang the whole
 * /api/run request — every candidate after it in analyst.ts included,
 * since they now run concurrently but each still needs its own ceiling.
 */
export async function runPipelineLive(candidate: ResurfacedCandidate): Promise<PipelineRunResult | null> {
  if (FORCE_SIMULATED_TIERS) return null;

  const mode = await resolveMode();
  if (mode !== "live") return null;

  const timeoutMs = 12000;
  try {
    const result = await Promise.race([
      withPipelineLock(() => runPipelineOnce(candidate)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    return result;
  } catch (err) {
    console.error("[rocketride] runPipelineOnce failed:", err);
    return null;
  }
}
