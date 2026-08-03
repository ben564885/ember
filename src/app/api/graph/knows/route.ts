import { NextResponse } from "next/server";
import { listKnowsEdges, deleteKnowsEdge, restoreKnowsEdge } from "@/lib/graph/queries";

export async function GET() {
  const edges = await listKnowsEdges();
  return NextResponse.json({
    edges: edges.map((e) => ({
      a: e.a.properties.id,
      aName: e.a.properties.name ?? "me",
      b: e.b.properties.id,
      bName: e.b.properties.name ?? "me",
      strength: e.r.properties.strength,
      context: e.r.properties.context,
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { action, aId, bId, strength, context } = body as {
    action: "delete" | "restore";
    aId: string;
    bId: string;
    strength?: string;
    context?: string;
  };

  if (action === "delete") {
    await deleteKnowsEdge(aId, bId);
    return NextResponse.json({ ok: true, action: "delete", aId, bId });
  }

  if (action === "restore") {
    await restoreKnowsEdge(aId, bId, strength ?? "medium", context ?? "restored");
    return NextResponse.json({ ok: true, action: "restore", aId, bId });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
