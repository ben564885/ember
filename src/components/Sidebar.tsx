"use client";

import Link from "next/link";
import { Flame, Users, Radio, Scissors, Home } from "lucide-react";

export type DashboardView = "council" | "firehose" | "killshot";

const items: { view: DashboardView; label: string; icon: typeof Users }[] = [
  { view: "council", label: "Agent council", icon: Users },
  { view: "firehose", label: "Live firehose", icon: Radio },
  { view: "killshot", label: "Kill shot", icon: Scissors },
];

export function Sidebar({ active, onChange }: { active: DashboardView; onChange: (v: DashboardView) => void }) {
  return (
    <aside className="flex w-20 shrink-0 flex-col items-center gap-6 bg-terracotta py-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-cream">
        <Flame className="h-5 w-5" strokeWidth={2.25} />
      </div>

      <nav className="flex flex-col gap-2">
        {items.map(({ view, label, icon: Icon }) => {
          const isActive = active === view;
          return (
            <button
              key={view}
              onClick={() => onChange(view)}
              title={label}
              aria-label={label}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
                isActive
                  ? "bg-cream-card text-terracotta-dark shadow-sm"
                  : "text-cream/70 hover:bg-terracotta-dark/60 hover:text-cream"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
            </button>
          );
        })}
      </nav>

      <div className="mt-auto">
        <Link
          href="/"
          title="Back to landing"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-cream/70 transition hover:bg-terracotta-dark/60 hover:text-cream"
        >
          <Home className="h-5 w-5" strokeWidth={2} />
        </Link>
      </div>
    </aside>
  );
}
