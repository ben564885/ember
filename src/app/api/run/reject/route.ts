import { NextResponse } from "next/server";
import { reject } from "@/lib/guild/approval";

export async function POST(req: Request) {
  const { key } = (await req.json()) as { key: string };
  const entry = reject(key);
  if (!entry) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, entry });
}
