"use client";

import { useState } from "react";

export function SeedControls() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function reseed() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/seed", { method: "POST" });
      const data = await res.json();
      const c = data.counts;
      setResult(
        `${c.startups} startups, ${c.founders} founders, ${c.passes} passes, ${c.knows} KNOWS edges, ${c.signals} signals`,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={reseed}
        disabled={loading}
        className="rounded-full border border-sand-dark bg-sand px-4 py-2.5 text-xs font-medium text-ink-faint hover:bg-sand-dark disabled:opacity-50"
      >
        {loading ? "Seeding…" : "Reset & seed graph"}
      </button>
      {result && <span className="text-xs text-ink-faint">{result}</span>}
    </div>
  );
}
