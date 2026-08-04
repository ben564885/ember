// Shared account list: used by seed.ts to build the graph and by
// laser/sources.ts to classify live public signals against tracked sectors.

export interface TrackedStartup {
  id: string;
  name: string;
  sector: string;
  stage: string;
  foundedYear: number;
  founderIds: string[];
  keywords: string[]; // lowercase match terms for live-signal classification
}

export const trackedStartups: TrackedStartup[] = [
  { id: "s-ferrylane", name: "Ferrylane", sector: "logistics", stage: "seed", foundedYear: 2025, founderIds: ["f-maya", "f-daniel"], keywords: ["logistics", "freight", "supply chain", "shipping"] },
  { id: "s-kelpwork", name: "Kelpwork", sector: "fintech infra", stage: "pre-seed", foundedYear: 2025, founderIds: ["f-priya"], keywords: ["fintech", "payments", "banking infrastructure"] },
  { id: "s-nordlight", name: "Nordlight", sector: "climate / energy", stage: "seed", foundedYear: 2025, founderIds: ["f-tomas", "f-anaelle"], keywords: ["climate", "energy", "solar", "grid", "carbon"] },
  // Deliberately narrow: generic devtools terms like "cli"/"ide"/"compiler"
  // word-match dozens of unrelated live GitHub pushes a day (Ghost-CLI,
  // copilot-cli, ...), flooding this one startup with a duplicate
  // resurfaced-candidate row per false-positive match. Ossuary Labs' own
  // repo name is specific enough not to collide with real live signals.
  { id: "s-ossuary", name: "Ossuary Labs", sector: "dev tools", stage: "pre-seed", foundedYear: 2026, founderIds: ["f-rowan"], keywords: ["ossuary labs", "jolt-lang", "jolt compiler"] },
  { id: "s-verdant", name: "Verdant Systems", sector: "supply chain AI", stage: "seed", foundedYear: 2025, founderIds: ["f-julia", "f-hakim"], keywords: ["supply chain", "logistics ai", "warehouse", "inventory"] },
  { id: "s-runwell", name: "Runwell", sector: "health infra", stage: "seed", foundedYear: 2025, founderIds: ["f-sana"], keywords: ["health tech", "healthcare", "clinical", "ehr", "medical"] },
  { id: "s-loamfield", name: "Loamfield", sector: "agtech", stage: "pre-seed", foundedYear: 2026, founderIds: ["f-desmond"], keywords: ["agtech", "agriculture", "farming", "crop"] },
];
