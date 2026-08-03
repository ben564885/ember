import { NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/guild/orchestrate";

export async function POST() {
  const result = await runFullPipeline();
  return NextResponse.json(result);
}
