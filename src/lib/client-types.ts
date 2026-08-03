// Client-safe copies of the shapes the dashboard needs. Kept separate from
// src/lib/graph and src/lib/rocketride so no server-only module (falkordb,
// rocketride, @laserdata/laser-sdk) ever gets pulled into the browser
// bundle via a type import.

export interface ResurfacedCandidateDTO {
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

export interface FirehoseTickDTO {
  at: number;
  fetched: number;
  matched: number;
  error: string | null;
}

export interface StatusDTO {
  mode: "live" | "simulated";
  detail: string;
  recentTicks?: FirehoseTickDTO[];
}

export interface AgentTraceStepDTO {
  agent: "Sourcer" | "Analyst" | "Outreach" | "Gatekeeper";
  input: unknown;
  output: unknown;
  note: string;
}

export interface GatekeeperEntryDTO {
  key: string;
  startupId: string;
  approvalStatus: "pending" | "approved" | "rejected";
  message: string | null;
  motion?: { mode: "live" | "simulated"; detail: string };
}

export interface RawSignalDTO {
  id: string;
  headline: string;
  url: string;
  source: "Hacker News" | "GitHub";
  timestamp: number;
  matchedStartupId: string | null;
}

export interface KnowsEdgeDTO {
  a: string;
  aName: string;
  b: string;
  bName: string;
  strength: string;
  context: string;
}
