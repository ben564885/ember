import { NextResponse } from "next/server";
import { getResurfacedCandidates } from "@/lib/graph/queries";

export async function GET() {
  const candidates = await getResurfacedCandidates();
  return NextResponse.json({ candidates });
}
