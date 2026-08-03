// Direct xAI Grok Live Search client — the credential and API surface the
// Skeptic agent owns exclusively; no other module in src/lib/guild imports
// this file. This is the middle tier of Skeptic's three-tier chain: tried
// when no real Guild.ai trigger is configured yet (see
// guild-platform/client.ts), before falling back to the deterministic
// local heuristic in guild/skeptic.ts.
//
// xAI's chat completions endpoint is OpenAI-compatible
// (https://api.x.ai/v1/chat/completions) with a `search_parameters` field
// that turns on Live Search; `sources: [{ type: "x" }]` scopes it to X
// (Twitter) posts specifically, per docs.x.ai. This shape was not
// independently verified against a live account during this build — no
// XAI_API_KEY was available to test against — so both the status probe and
// the verification call fail closed into "simulated" / null rather than
// throwing if the real API disagrees with this guess. Same honest-caveat
// contract as every other integration in this app: flip XAI_API_KEY on and
// the status bar will say exactly what actually happened.

import { FORCE_SIMULATED_TIERS } from "@/lib/demo-speed";

export type XaiMode = "live" | "simulated";

let resolvedMode: XaiMode | null = null;
let modeDetail = "";

async function resolveMode(): Promise<XaiMode> {
  if (resolvedMode) return resolvedMode;

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    resolvedMode = "simulated";
    modeDetail = "no XAI_API_KEY set";
    return resolvedMode;
  }

  try {
    const timeoutMs = 4000;
    const res = await Promise.race([
      fetch("https://api.x.ai/v1/models", { headers: { Authorization: `Bearer ${apiKey}` } }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!res) {
      resolvedMode = "simulated";
      modeDetail = `no response from api.x.ai within ${timeoutMs}ms`;
    } else if (!res.ok) {
      resolvedMode = "simulated";
      modeDetail = `api.x.ai/v1/models returned ${res.status}`;
    } else {
      resolvedMode = "live";
      modeDetail = "authenticated against api.x.ai";
    }
  } catch (err) {
    resolvedMode = "simulated";
    modeDetail = err instanceof Error ? err.message : String(err);
  }

  return resolvedMode;
}

export async function getXaiStatus(): Promise<{ mode: XaiMode; detail: string }> {
  const mode = await resolveMode();
  return { mode, detail: modeDetail };
}

export interface XaiVerification {
  verdict: "confirmed" | "rumor";
  reasoning: string;
}

/**
 * Asks Grok, with Live Search scoped to X, whether a startup signal reads
 * as a corroborated business event or an unverified rumor. Real fictional
 * demo startups will genuinely return zero X hits — that's expected, not a
 * failure — so the prompt asks Grok to judge the headline's own language
 * (does it self-report as rumored / unconfirmed / alleged?) jointly with
 * whatever corroboration search turns up, rather than treating "no posts
 * found" alone as disqualifying.
 */
export async function verifySignalOnX(params: {
  startupName: string;
  headline: string;
}): Promise<XaiVerification | null> {
  if (FORCE_SIMULATED_TIERS) return null;

  const mode = await resolveMode();
  if (mode !== "live") return null;

  try {
    const timeoutMs = 12000;
    const res = await Promise.race([
      fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "grok-4-fast",
          messages: [
            {
              role: "system",
              content:
                'You verify startup deal-flow signals. Live-search X (Twitter) for corroborating or contradicting posts about the given headline. Respond with strict JSON only, no prose outside it: {"verdict":"confirmed"|"rumor","reasoning":"<one sentence>"}. Judge "rumor" when the headline itself reads as unconfirmed/alleged/speculative, or when search surfaces explicit contradiction — not merely when search finds nothing, since small or early-stage startups often have no public chatter at all.',
            },
            { role: "user", content: `Startup: ${params.startupName}\nHeadline: ${params.headline}` },
          ],
          search_parameters: { mode: "auto", sources: [{ type: "x" }], return_citations: true },
          temperature: 0,
        }),
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);

    if (!res) throw new Error(`no response within ${timeoutMs}ms`);
    if (!res.ok) throw new Error(`xAI chat completions returned ${res.status}`);

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("xAI response had no message content");

    const parsed = JSON.parse(content) as { verdict?: string; reasoning?: string };
    if (parsed.verdict !== "confirmed" && parsed.verdict !== "rumor") {
      throw new Error(`unexpected verdict value: ${content}`);
    }
    return { verdict: parsed.verdict, reasoning: parsed.reasoning ?? "(no reasoning returned)" };
  } catch (err) {
    console.error("[xai] verifySignalOnX failed:", err);
    return null;
  }
}
