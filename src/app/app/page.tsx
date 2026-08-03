import Link from "next/link";
import { StatusBar } from "@/components/StatusBar";
import { SeedControls } from "@/components/SeedControls";
import { Firehose } from "@/components/Firehose";
import { PipelineRunner } from "@/components/PipelineRunner";
import { KillShot } from "@/components/KillShot";

export default function Dashboard() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 space-y-4">
        <div>
          <Link
            href="/"
            className="text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            ← ember
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-50">
            Ember
          </h1>
          <p className="mt-1 text-sm text-neutral-400">
            The living deal-flow layer: a graph that remembers why a deal died, resurfaces it when a
            new signal lands, and only acts through agents with a human approval gate.
          </p>
        </div>
        <StatusBar />
        <SeedControls />
      </header>

      <main className="space-y-6">
        <Firehose />
        <PipelineRunner />
        <KillShot />
      </main>

      <footer className="mt-10 border-t border-neutral-900 pt-4 text-xs text-neutral-600">
        See README.md for exactly which of the four mandatory integrations are live vs. honestly
        simulated in this environment, and what flipping an env var upgrades.
      </footer>
    </div>
  );
}
