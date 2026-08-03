import { getGraph } from "./client";
import { ME_ID } from "./schema";
import { trackedStartups } from "./accounts";

// Deterministic seed history: ~8 months of deal flow, ending "today". Every
// timestamp is computed relative to Date.now() so the demo always looks
// current no matter when it's run — replaying this is what "compounding
// memory" looks like on stage: eight months in one seed call.

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const daysAgo = (n: number) => now() - n * DAY;

interface Org {
  id: string;
  name: string;
}
interface Founder {
  id: string;
  name: string;
  currentRole: string;
  previouslyAt: string[]; // org ids
}
interface Pass {
  startupId: string;
  daysAgoAt: number;
  reason: string;
  notes: string;
}
interface Met {
  founderId: string;
  daysAgoAt: number;
  context: string;
}
interface Knows {
  a: string; // founder id or ME_ID
  b: string; // founder id
  strength: "strong" | "medium" | "weak";
  context: string;
}
interface SeedSignal {
  startupId: string;
  type: "funding" | "hiring" | "launch" | "press" | "github_velocity";
  headline: string;
  source: string;
  daysAgoAt: number;
  sentiment: "positive" | "neutral" | "negative";
}

const orgs: Org[] = [
  { id: "org-stripe", name: "Stripe" },
  { id: "org-google", name: "Google" },
  { id: "org-airbnb", name: "Airbnb" },
  { id: "org-plaid", name: "Plaid" },
  { id: "org-meta", name: "Meta" },
  { id: "org-databricks", name: "Databricks" },
  { id: "org-doordash", name: "DoorDash" },
];

const founders: Founder[] = [
  { id: "f-maya", name: "Maya Okonkwo", currentRole: "CTO, Ferrylane", previouslyAt: ["org-stripe"] },
  { id: "f-daniel", name: "Daniel Cho", currentRole: "CEO, Ferrylane", previouslyAt: ["org-airbnb"] },
  { id: "f-priya", name: "Priya Ramaswamy", currentRole: "CEO, Kelpwork", previouslyAt: ["org-plaid"] },
  { id: "f-tomas", name: "Tomas Vinter", currentRole: "CEO, Nordlight", previouslyAt: ["org-google"] },
  { id: "f-anaelle", name: "Anaelle Dubois", currentRole: "CTO, Nordlight", previouslyAt: ["org-meta"] },
  { id: "f-rowan", name: "Rowan Blackwell", currentRole: "CEO, Ossuary Labs", previouslyAt: ["org-databricks"] },
  { id: "f-julia", name: "Julia Ferreira", currentRole: "CEO, Verdant Systems", previouslyAt: ["org-stripe", "org-google"] },
  { id: "f-hakim", name: "Hakim Idris", currentRole: "CTO, Verdant Systems", previouslyAt: ["org-doordash"] },
  { id: "f-sana", name: "Sana Aliyev", currentRole: "CEO, Runwell", previouslyAt: ["org-airbnb"] },
  { id: "f-desmond", name: "Desmond Achebe", currentRole: "CEO, Loamfield", previouslyAt: ["org-plaid"] },
];

const startups = trackedStartups;

// Passes: deals we looked at and declined, ranging from 10 months to 5 weeks ago.
const passes: Pass[] = [
  { startupId: "s-ferrylane", daysAgoAt: 260, reason: "market too early", notes: "liked the team, thought logistics timing was off" },
  { startupId: "s-kelpwork", daysAgoAt: 210, reason: "solo founder risk", notes: "strong technically, wanted a co-founder before leading" },
  { startupId: "s-nordlight", daysAgoAt: 190, reason: "capital intensity", notes: "hardware-adjacent, didn't fit thesis at the time" },
  { startupId: "s-ossuary", daysAgoAt: 70, reason: "too early / pre-product", notes: "just an idea and a deck" },
  { startupId: "s-verdant", daysAgoAt: 240, reason: "crowded space", notes: "three other supply-chain AI decks that quarter" },
  { startupId: "s-runwell", daysAgoAt: 150, reason: "regulatory uncertainty", notes: "health infra compliance timeline unclear" },
  { startupId: "s-loamfield", daysAgoAt: 40, reason: "outside thesis", notes: "agtech, not a sector we track closely" },
];

// Meetings: founders we've personally met, independent of passing on their company.
const mets: Met[] = [
  { founderId: "f-maya", daysAgoAt: 265, context: "intro call before the pass" },
  { founderId: "f-priya", daysAgoAt: 215, context: "coffee, mutual friend introduced us" },
  { founderId: "f-julia", daysAgoAt: 300, context: "conference panel, exchanged contacts" },
];

// The warm network: KNOWS edges. Founder-to-founder and Me-to-founder.
// This is the exact edge set the "kill shot" demo prunes.
const knows: Knows[] = [
  { a: ME_ID, b: "f-julia", strength: "strong", context: "worked together briefly at a prior company" },
  { a: "f-julia", b: "f-hakim", strength: "strong", context: "co-founders" },
  { a: "f-hakim", b: "f-tomas", strength: "medium", context: "both ex-hyperscaler, same eng org alumni group" },
  { a: ME_ID, b: "f-priya", strength: "medium", context: "met at coffee" },
  { a: "f-priya", b: "f-maya", strength: "weak", context: "overlapped at Stripe for 8 months" },
  { a: ME_ID, b: "f-rowan", strength: "weak", context: "follows on X, one DM exchange" },
];

// Backfilled signals — history the graph already knew before "today".
const historicalSignals: SeedSignal[] = [
  { startupId: "s-ferrylane", type: "hiring", headline: "Ferrylane posts 3 senior eng roles", source: "LinkedIn Jobs", daysAgoAt: 255, sentiment: "neutral" },
  { startupId: "s-kelpwork", type: "launch", headline: "Kelpwork ships public API beta", source: "Product Hunt", daysAgoAt: 180, sentiment: "positive" },
  { startupId: "s-nordlight", type: "press", headline: "Nordlight featured in climate-tech roundup", source: "TechCrunch", daysAgoAt: 120, sentiment: "positive" },
  { startupId: "s-verdant", type: "github_velocity", headline: "Verdant's OSS SDK crosses 500 stars", source: "GitHub", daysAgoAt: 95, sentiment: "positive" },
  { startupId: "s-runwell", type: "hiring", headline: "Runwell hires former Oscar Health VP", source: "LinkedIn Jobs", daysAgoAt: 60, sentiment: "positive" },
];

// The "hits" — signals fresh enough to be the reason a passed deal resurfaces
// right now. These are what the flagship query is built to catch.
const freshSignals: SeedSignal[] = [
  { startupId: "s-ferrylane", type: "funding", headline: "Ferrylane closes $14M Series A led by a top-tier fund", source: "Crunchbase", daysAgoAt: 3, sentiment: "positive" },
  { startupId: "s-verdant", type: "funding", headline: "Verdant Systems raises $9M seed extension", source: "Crunchbase", daysAgoAt: 6, sentiment: "positive" },
  { startupId: "s-nordlight", type: "hiring", headline: "Nordlight hiring spree: 8 roles posted this week", source: "LinkedIn Jobs", daysAgoAt: 2, sentiment: "positive" },
  { startupId: "s-loamfield", type: "press", headline: "Loamfield mentioned in agtech roundup, mixed reception", source: "TechCrunch", daysAgoAt: 4, sentiment: "neutral" },
  // Deliberately rumor-flavored: same startup as the "launch" signal above,
  // reachable via the same Priya warm path, but this one is the Skeptic
  // agent's demo veto target — a real second candidate row Investment Angle
  // never gets to see unless the `skeptik` ablation toggle bypasses it.
  { startupId: "s-kelpwork", type: "press", headline: "Kelpwork rumored to be in acquisition talks, unconfirmed by either party", source: "TechCrunch", daysAgoAt: 2, sentiment: "neutral" },
];

export async function seed() {
  const graph = await getGraph();

  await graph.query("MATCH (n) DETACH DELETE n");

  await graph.query(
    `CREATE (:Me {id: $id, name: $name})`,
    { params: { id: ME_ID, name: "Ben Nisevich" } },
  );

  for (const o of orgs) {
    await graph.query(`CREATE (:Org {id: $id, name: $name})`, { params: { id: o.id, name: o.name } });
  }

  for (const f of founders) {
    await graph.query(
      `CREATE (:Founder {id: $id, name: $name, currentRole: $currentRole})`,
      { params: { id: f.id, name: f.name, currentRole: f.currentRole } },
    );
  }
  for (const f of founders) {
    for (const orgId of f.previouslyAt) {
      await graph.query(
        `MATCH (f:Founder {id: $fid}), (o:Org {id: $oid})
         CREATE (f)-[:PREVIOUSLY_AT]->(o)`,
        { params: { fid: f.id, oid: orgId } },
      );
    }
  }

  for (const s of startups) {
    await graph.query(
      `CREATE (:Startup {id: $id, name: $name, sector: $sector, stage: $stage, foundedYear: $foundedYear})`,
      { params: { id: s.id, name: s.name, sector: s.sector, stage: s.stage, foundedYear: s.foundedYear } },
    );
  }
  for (const s of startups) {
    for (const fid of s.founderIds) {
      await graph.query(
        `MATCH (f:Founder {id: $fid}), (s:Startup {id: $sid})
         CREATE (f)-[:FOUNDED]->(s)`,
        { params: { fid, sid: s.id } },
      );
    }
  }

  for (const p of passes) {
    await graph.query(
      `MATCH (me:Me {id: $meId}), (s:Startup {id: $sid})
       CREATE (me)-[:PASSED_ON {date: $date, reason: $reason, notes: $notes}]->(s)`,
      { params: { meId: ME_ID, sid: p.startupId, date: daysAgo(p.daysAgoAt), reason: p.reason, notes: p.notes } },
    );
  }

  for (const m of mets) {
    await graph.query(
      `MATCH (me:Me {id: $meId}), (f:Founder {id: $fid})
       CREATE (me)-[:MET {date: $date, context: $context}]->(f)`,
      { params: { meId: ME_ID, fid: m.founderId, date: daysAgo(m.daysAgoAt), context: m.context } },
    );
  }

  for (const k of knows) {
    await graph.query(
      `MATCH (a {id: $aid}), (b {id: $bid})
       CREATE (a)-[:KNOWS {strength: $strength, context: $context}]->(b)`,
      { params: { aid: k.a, bid: k.b, strength: k.strength, context: k.context } },
    );
  }

  for (const sig of [...historicalSignals, ...freshSignals]) {
    const id = `sig-${sig.startupId}-${sig.daysAgoAt}-${Math.random().toString(36).slice(2, 8)}`;
    await graph.query(
      `MATCH (s:Startup {id: $sid})
       CREATE (s)-[:HAD_SIGNAL]->(:Signal {
         id: $id, type: $type, headline: $headline, url: $url,
         source: $source, timestamp: $timestamp, sentiment: $sentiment
       })`,
      {
        params: {
          sid: sig.startupId,
          id,
          type: sig.type,
          headline: sig.headline,
          url: `https://example.com/signal/${id}`,
          source: sig.source,
          timestamp: daysAgo(sig.daysAgoAt),
          sentiment: sig.sentiment,
        },
      },
    );
  }

  return {
    orgs: orgs.length,
    founders: founders.length,
    startups: startups.length,
    passes: passes.length,
    mets: mets.length,
    knows: knows.length,
    signals: historicalSignals.length + freshSignals.length,
  };
}
