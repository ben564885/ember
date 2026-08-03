import { NextResponse } from "next/server";
import { getGraph } from "@/lib/graph/client";

export async function GET() {
  try {
    const graph = await getGraph();
    await graph.query("RETURN 1");
    return NextResponse.json({ mode: "live", detail: "FalkorDB reachable, Cypher query executed" });
  } catch (err) {
    return NextResponse.json({
      mode: "simulated",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
