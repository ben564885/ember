/**
 * Live Guild/xAI/RocketRide calls each poll for up to 20s per candidate
 * (see guild-platform/client.ts's pollSession, xai.ts's verifySignalOnX,
 * rocketride/client.ts's runPipelineLive) and Guild's own per-account
 * session queue can push real runs past that window entirely under normal
 * candidate counts — confirmed live at 33-candidate scale. Far too slow and
 * unpredictable for a live demo.
 *
 * This flag short-circuits all three live tiers straight to each stage's
 * local simulated/heuristic fallback, so a pipeline run is fast and
 * deterministic. Every stage still records source: "simulated" in its
 * trace either way, so the UI never overstates what actually ran — set
 * PIPELINE_LIVE_TIERS=true to re-enable the real network calls.
 */
export const FORCE_SIMULATED_TIERS = process.env.PIPELINE_LIVE_TIERS !== "true";
