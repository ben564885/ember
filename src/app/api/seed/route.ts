import { NextResponse } from "next/server";
import { seed } from "@/lib/graph/seed";

export async function POST() {
  const counts = await seed();
  return NextResponse.json({ ok: true, counts });
}
