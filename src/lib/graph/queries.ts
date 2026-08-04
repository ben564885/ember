import { graphQuery } from "./client";
import { ME_ID } from "./schema";

export interface ResurfacedCandidate {
  /** Unique per (startup, signal, founder path) — kept specific even though getResurfacedCandidates now returns at most one row per startup, so a shape change there doesn't silently collide keys. */
  key: string;
  startupId: string;
  startupName: string;
  sector: string;
  passDate: number;
  passReason: string;
  signalId: string;
  signalHeadline: string;
  signalType: string;
  signalTimestamp: number;
  founderId: string;
  founderName: string;
  pathHops: number;
  pathNames: string[];
}

/**
 * The flagship query: startups I passed on, where a signal landed *after*
 * the pass, and I have a warm path (<=2 hops through KNOWS) to a current
 * founder. One Cypher statement. The relational equivalent is a self-join
 * on an edge table plus a recursive CTE for the path — this is what "the
 * graph earns its keep" looks like as a single query instead of a slide.
 *
 * `ignoreTimePredicate` is the `time` ablation toggle: it drops the
 * `WHERE sig.timestamp > passed.date` clause, so stale signals the fund
 * already knew about when it passed leak back into the ranked list. Unlike
 * the other three toggles, this one *increases* the candidate count when
 * active — proof runs the opposite direction, which is deliberate.
 *
 * A startup can match this query many times over — once per qualifying
 * signal, once more per reachable founder — and the live GitHub/HN firehose
 * only adds to that over a long-running session (a broad keyword match can
 * rack up one HAD_SIGNAL per live poll). Rather than let the candidate list
 * grow unbounded, this collapses to the single freshest signal per startup
 * (rows already arrive sorted `sig.timestamp DESC, hops ASC`, so the first
 * occurrence per startupId is both the newest signal and the shortest path
 * to it) and caps the result to `limit` startups — a small, stable list for
 * the council to work through instead of a wall of near-duplicate rows.
 */
export async function getResurfacedCandidates(
  maxHops = 2,
  opts: { ignoreTimePredicate?: boolean; limit?: number } = {},
): Promise<ResurfacedCandidate[]> {
  const timeClause = opts.ignoreTimePredicate ? "" : "WHERE sig.timestamp > passed.date";
  const rows = await graphQuery<{
    s: { properties: Record<string, unknown> };
    sig: { properties: Record<string, unknown> };
    f: { properties: Record<string, unknown> };
    passed: { properties: Record<string, unknown> };
    hops: number;
    pathNames: string[];
  }>(
    `MATCH (me:Me {id: $meId})-[passed:PASSED_ON]->(s:Startup)-[:HAD_SIGNAL]->(sig:Signal)
     ${timeClause}
     MATCH (s)<-[:FOUNDED]-(f:Founder)
     MATCH path = (me)-[:KNOWS*1..${maxHops}]-(f)
     WITH s, sig, f, passed, path,
          length(path) AS hops,
          [n IN nodes(path) | coalesce(n.name, 'me')] AS pathNames
     RETURN s, sig, f, passed, hops, pathNames
     ORDER BY sig.timestamp DESC, hops ASC`,
    { meId: ME_ID },
  );

  const candidates = rows.map((r) => ({
    key: `${r.s.properties.id}::${r.sig.properties.id}::${r.f.properties.id}`,
    startupId: r.s.properties.id as string,
    startupName: r.s.properties.name as string,
    sector: r.s.properties.sector as string,
    passDate: r.passed.properties.date as number,
    passReason: r.passed.properties.reason as string,
    signalId: r.sig.properties.id as string,
    signalHeadline: r.sig.properties.headline as string,
    signalType: r.sig.properties.type as string,
    signalTimestamp: r.sig.properties.timestamp as number,
    founderId: r.f.properties.id as string,
    founderName: r.f.properties.name as string,
    pathHops: r.hops,
    pathNames: r.pathNames,
  }));

  const seenStartups = new Set<string>();
  const onePerStartup: ResurfacedCandidate[] = [];
  for (const c of candidates) {
    if (seenStartups.has(c.startupId)) continue;
    seenStartups.add(c.startupId);
    onePerStartup.push(c);
  }

  return onePerStartup.slice(0, opts.limit ?? 3);
}

/** Full snapshot for the graph explorer view. */
export async function getGraphSnapshot() {
  const nodes = await graphQuery<{ n: { id: number; labels: string[]; properties: Record<string, unknown> } }>(
    `MATCH (n) RETURN n`,
  );
  const edges = await graphQuery<{
    a: { id: number };
    r: { type: string; properties: Record<string, unknown> };
    b: { id: number };
  }>(`MATCH (a)-[r]->(b) RETURN a, r, b`);

  return {
    nodes: nodes.map((row) => ({
      id: row.n.id,
      labels: row.n.labels,
      properties: row.n.properties,
    })),
    edges: edges.map((row) => ({
      source: row.a.id,
      target: row.b.id,
      type: row.r.type,
      properties: row.r.properties,
    })),
  };
}

/** The kill-shot demo move: sever one warm-path edge and re-run the query live. */
export async function deleteKnowsEdge(aId: string, bId: string) {
  await graphQuery(
    `MATCH (a {id: $aId})-[k:KNOWS]-(b {id: $bId}) DELETE k`,
    { aId, bId },
  );
}

export async function restoreKnowsEdge(
  aId: string,
  bId: string,
  strength: string,
  context: string,
) {
  await graphQuery(
    `MATCH (a {id: $aId}), (b {id: $bId})
     MERGE (a)-[:KNOWS {strength: $strength, context: $context}]->(b)`,
    { aId, bId, strength, context },
  );
}

export async function listKnowsEdges() {
  return graphQuery<{ a: { properties: { id: string; name?: string } }; b: { properties: { id: string; name?: string } }; r: { properties: Record<string, unknown> } }>(
    `MATCH (a)-[r:KNOWS]->(b) RETURN a, r, b`,
  );
}

/** Called by the LaserData ingestion writer when a new live signal lands. */
export async function insertSignalForStartup(
  startupId: string,
  signal: {
    id: string;
    type: string;
    headline: string;
    url: string;
    source: string;
    timestamp: number;
    sentiment: string;
  },
) {
  // MERGE on Signal.id: the same live item reappears across polling ticks
  // (HN/GitHub don't disappear between requests), so this must be
  // idempotent rather than appending a duplicate node every tick.
  await graphQuery(
    `MATCH (s:Startup {id: $startupId})
     MERGE (sig:Signal {id: $id})
     ON CREATE SET sig.type = $type, sig.headline = $headline, sig.url = $url,
                    sig.source = $source, sig.timestamp = $timestamp, sig.sentiment = $sentiment
     MERGE (s)-[:HAD_SIGNAL]->(sig)`,
    { startupId, ...signal },
  );
}

export async function listStartups() {
  return graphQuery<{ s: { properties: Record<string, unknown> } }>(
    `MATCH (s:Startup) RETURN s ORDER BY s.name`,
  );
}
