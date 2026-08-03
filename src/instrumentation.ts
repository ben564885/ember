// Runs once when the Next.js server process starts (stable since Next 15,
// see node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
// Used here to keep the LaserData -> FalkorDB signal write genuinely
// continuous instead of only firing on a manual "Pull live signals" click —
// the mandatory-stack requirement is that memory compounds *as the agent
// operates*, not just at seed time or on a button press.
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { startFirehoseScheduler } = await import("@/lib/laser/scheduler");
  startFirehoseScheduler();
}
