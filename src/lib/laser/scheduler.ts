import { runIngestTick } from "./ingest";

// instrumentation.ts's register() and this app's route handlers can end up
// as separate module instantiations under Turbopack's per-layer module
// graph, so a plain module-scope array here would silently split into two
// independent copies — the scheduler ticking one, routes reading the other
// (always empty). Parking state on globalThis sidesteps that: there's only
// one Node process, so it's the one thing guaranteed shared across layers.
declare global {
  var __firehoseSchedulerStarted: boolean | undefined;
  var __firehoseTicks: FirehoseTickLog[] | undefined;
}

const INTERVAL_MS = Number(process.env.FIREHOSE_INTERVAL_MS ?? 90_000);
const MAX_LOG = 20;

export interface FirehoseTickLog {
  at: number;
  fetched: number;
  matched: number;
  error: string | null;
}

function store(): FirehoseTickLog[] {
  if (!globalThis.__firehoseTicks) globalThis.__firehoseTicks = [];
  return globalThis.__firehoseTicks;
}

export function getRecentTicks(): FirehoseTickLog[] {
  return store();
}

export function startFirehoseScheduler() {
  if (globalThis.__firehoseSchedulerStarted) return;
  globalThis.__firehoseSchedulerStarted = true;

  const tick = async () => {
    const recent = store();
    try {
      const result = await runIngestTick();
      recent.push({ at: Date.now(), fetched: result.fetched, matched: result.matched, error: null });
    } catch (err) {
      recent.push({
        at: Date.now(),
        fetched: 0,
        matched: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (recent.length > MAX_LOG) recent.splice(0, recent.length - MAX_LOG);
  };

  tick();
  setInterval(tick, INTERVAL_MS);
}
