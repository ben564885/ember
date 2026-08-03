import { NextResponse } from "next/server";
import { getGraphSnapshot } from "@/lib/graph/queries";

export async function GET() {
  const snapshot = await getGraphSnapshot();
  return NextResponse.json(snapshot);
}
