"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusBar } from "@/components/StatusBar";
import { SeedControls } from "@/components/SeedControls";
import { Firehose } from "@/components/Firehose";
import { Council } from "@/components/Council";
import { KillShot } from "@/components/KillShot";
import { Sidebar, type DashboardView } from "@/components/Sidebar";

export default function Dashboard() {
  const [view, setView] = useState<DashboardView>("council");

  return (
    <div className="flex min-h-screen w-full bg-cream">
      <Sidebar active={view} onChange={setView} />

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="text-xs text-ink-faint transition hover:text-ink">
            ← ember
          </Link>
          <div className="flex items-center gap-3">
            <SeedControls />
            <StatusBar />
          </div>
        </header>

        <main>
          {view === "council" && <Council />}
          {view === "firehose" && <Firehose />}
          {view === "killshot" && <KillShot />}
        </main>

        <footer className="mt-10 border-t border-sand-dark pt-4 text-xs text-ink-faint">
          See README.md for exactly which of the four mandatory integrations are live vs. honestly
          simulated in this environment, and what flipping an env var upgrades.
        </footer>
      </div>
    </div>
  );
}
