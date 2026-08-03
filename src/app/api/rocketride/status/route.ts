import { NextResponse } from "next/server";
import { getRocketRideStatus } from "@/lib/rocketride/client";

export async function GET() {
  const status = await getRocketRideStatus();
  return NextResponse.json(status);
}
