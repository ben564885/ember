import { publishSignal, pollSignals, getLaserStatus } from "./client";
import { fetchAllLiveSignals, matchToTrackedStartup, type RawSignal } from "./sources";
import { insertSignalForStartup } from "@/lib/graph/queries";

const TOPIC = "live-firehose";

export interface IngestResult {
  fetched: number;
  matched: number;
  laser: { mode: string; detail: string };
  signals: (RawSignal & { matchedStartupId: string | null })[];
}

/**
 * One tick of the LaserData pipeline: pull real signals from the internet,
 * publish every one of them through Laser (real backend or honest
 * fallback — see client.ts), and for anything that matches a tracked
 * startup's sector, write it onto the graph as a real HAD_SIGNAL edge.
 * This is the "signal → memory" hop in the LaserData → FalkorDB leg of the
 * reference data flow.
 */
export async function runIngestTick(): Promise<IngestResult> {
  const laser = await getLaserStatus();
  const raw = await fetchAllLiveSignals();

  const enriched = raw.map((s) => ({ ...s, matchedStartupId: matchToTrackedStartup(s) }));

  for (const s of enriched) {
    await publishSignal(TOPIC, s);
  }

  let matched = 0;
  for (const s of enriched) {
    if (!s.matchedStartupId) continue;
    matched++;
    await insertSignalForStartup(s.matchedStartupId, {
      id: s.id,
      type: s.source === "GitHub" ? "github_velocity" : "press",
      headline: s.headline,
      url: s.url,
      source: s.source,
      timestamp: s.timestamp,
      sentiment: "neutral",
    });
  }

  return { fetched: enriched.length, matched, laser, signals: enriched.slice(0, 25) };
}

export async function getFirehoseBacklog(sinceOffset = 0) {
  return pollSignals(TOPIC, sinceOffset);
}
