"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { StatusDTO } from "@/lib/client-types";

type Row = { label: string; endpoint: string; logo: string };

const rows: Row[] = [
  { label: "FalkorDB", endpoint: "/api/graph/status", logo: "/logos/falkor.svg" },
  { label: "LaserData", endpoint: "/api/signals/status", logo: "/logos/laserdata.jpeg" },
  { label: "RocketRide", endpoint: "/api/rocketride/status", logo: "/logos/rocketride.jpeg" },
  { label: "Guild", endpoint: "/api/guild/status", logo: "/logos/guild.jpeg" },
];

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

  const allChecking = rows.some((r) => (statuses[r.label]?.mode ?? "checking") === "checking");

  return (
    <div className="flex items-center gap-3 rounded-full border border-sand-dark bg-sand px-4 py-2.5">
      <div className="flex items-center -space-x-1.5">
        {rows.map((r) => (
          <div
            key={r.label}
            title={statuses[r.label]?.detail ?? r.label}
            className="relative h-7 w-7 overflow-hidden rounded-full border border-sand-dark ring-2 ring-sand"
          >
            <Image src={r.logo} alt={r.label} fill sizes="28px" className="object-cover" />
          </div>
        ))}
      </div>
      <span className="text-xs font-medium text-ink-faint">
        {allChecking ? "checking..." : "connected"}
      </span>
    </div>
  );
}
