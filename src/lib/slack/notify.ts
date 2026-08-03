// The actual "motion" half of Memory Meets Motion: approving a candidate in
// Gatekeeper used to just flip an in-memory status with no external effect.
// This fires a real Slack Incoming Webhook POST when SLACK_WEBHOOK_URL is
// set — same honest-degradation contract as every other integration here:
// unset or unreachable falls back to "simulated" rather than pretending to
// have sent anything.
export interface MotionResult {
  mode: "live" | "simulated";
  detail: string;
}

export async function sendApprovalToSlack(params: {
  startupId: string;
  message: string;
}): Promise<MotionResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    return { mode: "simulated", detail: "no SLACK_WEBHOOK_URL set" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rocket: *Ember — re-engagement approved: ${params.startupId}*\n${params.message}`,
      }),
    });
    if (!res.ok) {
      return { mode: "simulated", detail: `Slack webhook returned ${res.status}` };
    }
    return { mode: "live", detail: "posted to Slack" };
  } catch (err) {
    return { mode: "simulated", detail: err instanceof Error ? err.message : String(err) };
  }
}
