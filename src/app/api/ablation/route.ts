import { NextResponse } from "next/server";
import { getAblationState, setAblationToggle, type AblationState } from "@/lib/ablation/state";

export async function GET() {
  return NextResponse.json(getAblationState());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { key: keyof AblationState; value: boolean };
  const state = setAblationToggle(body.key, body.value);
  return NextResponse.json(state);
}
