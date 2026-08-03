import { NextResponse } from "next/server";
import { runIngestTick } from "@/lib/laser/ingest";

export async function POST() {
  try {
    const result = await runIngestTick();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
