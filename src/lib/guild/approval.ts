import type { AgentTraceStep, ApprovalEntry, DraftOutput } from "./types";
import { sendApprovalToSlack } from "@/lib/slack/notify";

/**
 * Approval (formerly "Gatekeeper"): the human-approval boundary. Nothing
 * Citation & Draft produces is ever sent automatically — it lands here as
 * "pending" and stays pending until a person calls approve() or reject()
 * through the UI. In-memory queue is fine for a demo process; a real
 * deployment would back this with a table. approve() is the one place real
 * motion happens: a Slack webhook POST, gated behind the same human click
 * reject() never triggers.
 */
const queue = new Map<string, ApprovalEntry>();

export function runApproval(outputs: DraftOutput[]): { queued: ApprovalEntry[]; trace: AgentTraceStep } {
  const queued: ApprovalEntry[] = outputs.map((o) => {
    const common = {
      key: o.key,
      startupId: o.startupId,
      startupName: o.startupName,
      pathNames: o.pathNames,
      signalHeadline: o.signalHeadline,
    };
    const entry: ApprovalEntry =
      o.status === "drafted"
        ? { ...common, approvalStatus: "pending", message: o.message }
        : { ...common, approvalStatus: "rejected", message: null };
    queue.set(entry.key, entry);
    return entry;
  });

  return {
    queued,
    trace: {
      agent: "Approval",
      input: { draftCount: outputs.length },
      output: queued,
      note: "Every drafted message held for explicit human approval. Nothing here sends anything.",
    },
  };
}

export function listQueue(): ApprovalEntry[] {
  return Array.from(queue.values());
}

export async function approve(key: string): Promise<ApprovalEntry | null> {
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

export function reject(key: string): ApprovalEntry | null {
  const entry = queue.get(key);
  if (!entry) return null;
  entry.approvalStatus = "rejected";
  queue.set(key, entry);
  return entry;
}
