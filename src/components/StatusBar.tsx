"use client";

import { useEffect, useState } from "react";
import type { StatusDTO } from "@/lib/client-types";

type Row = { label: string; endpoint: string; alwaysLive?: boolean };

const rows: Row[] = [
  { label: "FalkorDB", endpoint: "/api/graph/status" },
  { label: "LaserData", endpoint: "/api/signals/status" },
  { label: "RocketRide", endpoint: "/api/rocketride/status" },
];

function Pill({ label, status }: { label: string; status: StatusDTO | null }) {
  const mode = status?.mode ?? "checking";
  const color =
    mode === "live"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : mode === "simulated"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-neutral-500/15 text-neutral-400 border-neutral-500/30";

  return (
    <div
      title={status?.detail ?? "checking..."}
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${color}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${mode === "live" ? "bg-emerald-400" : mode === "simulated" ? "bg-amber-400" : "bg-neutral-400"}`} />
      {label}: {mode}
    </div>
  );
}

export function StatusBar() {
  const [statuses, setStatuses] = useState<Record<string, StatusDTO | null>>({});

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const entries = await Promise.all(
        rows.map(async (r) => {
          try {
            const res = await fetch(r.endpoint);
            const data = (await res.json()) as StatusDTO;
            return [r.label, data] as const;
          } catch {
            return [r.label, { mode: "simulated", detail: "unreachable" } as StatusDTO] as const;
          }
        }),
      );
      if (!cancelled) setStatuses(Object.fromEntries(entries));
    }
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rows.map((r) => (
        <Pill key={r.label} label={r.label} status={statuses[r.label] ?? null} />
      ))}
      <div className="flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-xs font-medium text-sky-400">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
        Guild: custom (no real SDK found)
      </div>
    </div>
  );
}
