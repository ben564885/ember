// Graph schema for Ember.
//
// Nodes:  Me, Founder, Startup, Org, Signal
// Edges:  FOUNDED, PREVIOUSLY_AT, COMPETITOR_OF, HAD_SIGNAL,
//         PASSED_ON (Me->Startup), MET (Me->Founder), KNOWS (Founder<->Founder, Me->Founder)
//
// KNOWS is the edge the "kill shot" demo deletes: remove it, the warm path
// disappears, and a startup that resurfaced with a live signal drops back
// out of the ranked list — because the path no longer exists, not because a
// score was recomputed.

export type SignalType = "funding" | "hiring" | "launch" | "press" | "github_velocity";

export interface FounderNode {
  id: string;
  name: string;
  currentRole: string;
}

export interface OrgNode {
  id: string;
  name: string;
}

export interface StartupNode {
  id: string;
  name: string;
  sector: string;
  stage: string;
  foundedYear: number;
}

export interface SignalNode {
  id: string;
  type: SignalType;
  headline: string;
  url: string;
  source: string;
  timestamp: number; // epoch ms
  sentiment: "positive" | "neutral" | "negative";
}

export const LABELS = {
  ME: "Me",
  FOUNDER: "Founder",
  STARTUP: "Startup",
  ORG: "Org",
  SIGNAL: "Signal",
} as const;

export const RELS = {
  FOUNDED: "FOUNDED",
  PREVIOUSLY_AT: "PREVIOUSLY_AT",
  COMPETITOR_OF: "COMPETITOR_OF",
  HAD_SIGNAL: "HAD_SIGNAL",
  PASSED_ON: "PASSED_ON",
  MET: "MET",
  KNOWS: "KNOWS",
} as const;

export const ME_ID = "me";
