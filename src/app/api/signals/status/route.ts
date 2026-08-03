import { NextResponse } from "next/server";
import { getLaserStatus } from "@/lib/laser/client";
import { getRecentTicks } from "@/lib/laser/scheduler";

export async function GET() {
  const status = await getLaserStatus();
  return NextResponse.json({ ...status, recentTicks: getRecentTicks() });
}
