import { NextResponse } from "next/server";
import { getGuildPlatformStatus } from "@/lib/guild-platform/client";
import { getXaiStatus } from "@/lib/guild-platform/xai";

/**
 * Reports what Skeptic will actually reach for on the next run, honestly —
 * "live" only when a real Guild.ai trigger is configured; "simulated"
 * (with the exact reason) otherwise, same as every other status pill.
 * Falls back to xAI's status as the detail when Guild isn't configured,
 * since that's the tier Skeptic will actually use.
 */
export async function GET() {
  const [guild, xai] = await Promise.all([getGuildPlatformStatus(), getXaiStatus()]);

  if (guild.mode === "live") {
    return NextResponse.json({ mode: "live", detail: `Guild.ai trigger: ${guild.detail}` });
  }
  if (xai.mode === "live") {
    return NextResponse.json({
      mode: "simulated",
      detail: `No Guild.ai trigger configured (${guild.detail}) — Skeptic falls back to direct xAI Live Search: ${xai.detail}`,
    });
  }
  return NextResponse.json({
    mode: "simulated",
    detail: `No Guild.ai trigger (${guild.detail}) and no xAI key (${xai.detail}) — Skeptic falls back to a deterministic local heuristic`,
  });
}
