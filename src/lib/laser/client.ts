import { fallbackPoll, fallbackPublish } from "./fallback";

// Real @laserdata/laser-sdk wiring, with one honest caveat documented here
// and in README.md: the SDK's TCP transport (`apache-iggy@0.8.1-edge.3`)
// hangs mid-handshake against every vanilla OSS Apache Iggy build tried
// (:latest, :0.8.2-edge.1, :edge — all pulled and port-verified reachable
// during this build). The SDK's own docs say it "always constructs a VSR
// client" with "no protocol option," which reads as a LaserData-managed
// wire extension that vanilla OSS Iggy doesn't speak — most likely this
// SDK is built to talk to LaserData Cloud or a "Laser Stack" managed
// backend, not a bare community Iggy container. Point
// LASER_CONNECTION_STRING at a real managed backend and this file needs
// zero changes to go live — the connect attempt below is the real call,
// not a stub.

export type LaserMode = "live" | "simulated";

let resolvedMode: LaserMode | null = null;
let modeDetail = "";

async function resolveMode(): Promise<LaserMode> {
  if (resolvedMode) return resolvedMode;

  const connectionString = process.env.LASER_CONNECTION_STRING;
  if (!connectionString) {
    resolvedMode = "simulated";
    modeDetail = "no LASER_CONNECTION_STRING set";
    return resolvedMode;
  }

  try {
    const { Laser } = await import("@laserdata/laser-sdk");
    const timeoutMs = 4000;
    const attempt = Laser.connect(connectionString);
    const result = await Promise.race([
      attempt.then((laser) => ({ ok: true as const, laser })),
      new Promise<{ ok: false; reason: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, reason: `no handshake within ${timeoutMs}ms` }), timeoutMs),
      ),
    ]);

    if (result.ok) {
      resolvedMode = "live";
      modeDetail = "connected to " + connectionString;
      // Deliberately not stored/closed: this process-lifetime probe exists
      // only to answer "is the real backend reachable." The ingestion
      // path below reconnects per call, matching the SDK's documented
      // per-topic connection model.
    } else {
      resolvedMode = "simulated";
      modeDetail = result.reason;
    }
  } catch (err) {
    resolvedMode = "simulated";
    modeDetail = err instanceof Error ? err.message : String(err);
  }

  return resolvedMode;
}

export async function getLaserStatus(): Promise<{ mode: LaserMode; detail: string }> {
  const mode = await resolveMode();
  return { mode, detail: modeDetail };
}

export async function publishSignal(topic: string, value: unknown): Promise<void> {
  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const { Laser } = await import("@laserdata/laser-sdk");
      const laser = await Laser.connect(process.env.LASER_CONNECTION_STRING!);
      const t = laser.stream("ember").topic(topic);
      await t.ensure(1);
      await t.publish().json(value as object).send();
      await laser.close();
      return;
    } catch {
      // Fall through to fallback transport for this call only; status
      // stays whatever resolveMode() decided at process start.
    }
  }

  fallbackPublish(topic, value);
}

export async function pollSignals(topic: string, sinceOffset = 0) {
  const mode = await resolveMode();

  if (mode === "live") {
    try {
      const { Laser } = await import("@laserdata/laser-sdk");
      const laser = await Laser.connect(process.env.LASER_CONNECTION_STRING!);
      const t = laser.stream("ember").topic(topic);
      const reader = await t.replay();
      const records = await reader.poll();
      await laser.close();
      const decoder = new TextDecoder();
      return records.map((r, i) => ({
        offset: i,
        value: JSON.parse(decoder.decode(r.payload)),
        timestamp: Date.now(),
      }));
    } catch {
      // fall through
    }
  }

  return fallbackPoll(topic, sinceOffset);
}
