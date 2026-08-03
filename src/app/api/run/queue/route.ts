import { NextResponse } from "next/server";
import { listQueue } from "@/lib/guild/approval";

export async function GET() {
  return NextResponse.json({ queue: listQueue() });
}
