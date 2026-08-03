import type { AgentTraceStep, GatekeeperOutput, OutreachOutput } from "./types";
import { sendApprovalToSlack } from "@/lib/slack/notify";

/**
 * Gatekeeper: the human-approval boundary, same shape as Scout's
 * human-in-the-loop gate. Nothing Outreach drafts is ever sent
 * automatically — it lands here as "pending" and stays pending until a
 * person calls approve() or reject() through the UI. In-memory queue is
 * fine for a demo process; a real deployment would back this with a table.
 * approve() is the one place real motion happens: a Slack webhook POST,
 * gated behind the same human click reject() never triggers.
 */
const queue = new Map<string, GatekeeperOutput>();

export function runGatekeeper(outputs: OutreachOutput[]): { queued: GatekeeperOutput[]; trace: AgentTraceStep } {
  const queued: GatekeeperOutput[] = outputs.map((o) => {
    const entry: GatekeeperOutput =
      o.status === "drafted"
        ? { key: o.key, startupId: o.startupId, approvalStatus: "pending", message: o.message }
        : { key: o.key, startupId: o.startupId, approvalStatus: "rejected", message: null };
    queue.set(entry.key, entry);
    return entry;
  });

  return {
    queued,
    trace: {
      agent: "Gatekeeper",
      input: { draftCount: outputs.length },
      output: queued,
      note: "Every drafted message held for explicit human approval. Nothing here sends anything.",
    },
  };
}

export function listQueue(): GatekeeperOutput[] {
  return Array.from(queue.values());
}

export async function approve(key: string): Promise<GatekeeperOutput | null> {
  const entry = queue.get(key);
  if (!entry) return null;
  entry.approvalStatus = "approved";
  entry.motion = await sendApprovalToSlack({
    startupId: entry.startupId,
    message: entry.message ?? "(no message)",
  });
  queue.set(key, entry);
  return entry;
}

export function reject(key: string): GatekeeperOutput | null {
  const entry = queue.get(key);
  if (!entry) return null;
  entry.approvalStatus = "rejected";
  queue.set(key, entry);
  return entry;
}
