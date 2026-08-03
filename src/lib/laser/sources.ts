import { trackedStartups } from "@/lib/graph/accounts";

// Real live public data. No API key for either endpoint — this is what
// actually keeps the LaserData layer load-bearing: the app makes a genuine
// network call, on every poll, to a source it doesn't control.

export interface RawSignal {
  id: string;
  headline: string;
  url: string;
  source: "Hacker News" | "GitHub";
  timestamp: number;
  raw: string; // lowercased text used for sector matching
}

interface HNHit {
  objectID: string;
  title: string | null;
  url: string | null;
  created_at_i: number;
  story_text?: string | null;
}

export async function fetchHackerNewsSignals(): Promise<RawSignal[]> {
  const url =
    "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=40&query=startup%20OR%20funding%20OR%20raises%20OR%20seed%20OR%20series";

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HN Algolia ${res.status}`);
  const data = (await res.json()) as { hits: HNHit[] };

  return data.hits
    .filter((h) => h.title)
    .map((h) => ({
      id: `hn-${h.objectID}`,
      headline: h.title as string,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      source: "Hacker News" as const,
      timestamp: h.created_at_i * 1000,
      raw: `${h.title} ${h.story_text ?? ""}`.toLowerCase(),
    }));
}

interface GHRepoItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  pushed_at: string;
  stargazers_count: number;
}

export async function fetchGithubVelocitySignals(): Promise<RawSignal[]> {
  // Recently-pushed repos with meaningful star counts, as a stand-in for
  // "github velocity" — a real, unauthenticated, rate-limited-but-free
  // public endpoint.
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=pushed:>${oneWeekAgo}+stars:>50&sort=updated&order=desc&per_page=30`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json", "User-Agent": "ember-demo" },
  });
  if (!res.ok) throw new Error(`GitHub search ${res.status}`);
  const data = (await res.json()) as { items: GHRepoItem[] };

  return data.items.map((r) => ({
    id: `gh-${r.id}`,
    headline: `${r.full_name} — ${r.stargazers_count}★, pushed ${r.pushed_at.slice(0, 10)}`,
    url: r.html_url,
    source: "GitHub" as const,
    timestamp: new Date(r.pushed_at).getTime(),
    raw: `${r.full_name} ${r.description ?? ""}`.toLowerCase(),
  }));
}

export async function fetchAllLiveSignals(): Promise<RawSignal[]> {
  const [hn, gh] = await Promise.allSettled([
    fetchHackerNewsSignals(),
    fetchGithubVelocitySignals(),
  ]);
  const out: RawSignal[] = [];
  if (hn.status === "fulfilled") out.push(...hn.value);
  if (gh.status === "fulfilled") out.push(...gh.value);
  return out.sort((a, b) => b.timestamp - a.timestamp);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match, not substring: plain .includes() would match "cli"
// inside "climate" and "ide" inside "provide"/"guide"/"outside" — short
// keywords like those are exactly the ones a naive matcher gets wrong.
function containsWord(haystack: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i");
  return pattern.test(haystack);
}

/** Sector-keyword match against the tracked account list. Null = no match (pure noise, shown in the firehose only). */
export function matchToTrackedStartup(signal: RawSignal): string | null {
  for (const s of trackedStartups) {
    if (s.keywords.some((kw) => containsWord(signal.raw, kw))) {
      return s.id;
    }
  }
  return null;
}
