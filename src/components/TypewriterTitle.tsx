"use client";

import { useEffect, useState } from "react";

// Types "embre" (a swapped-letter typo), backspaces to fix it, then finishes with a period.
const FRAMES = [
  "e",
  "em",
  "emb",
  "embr",
  "embre",
  "embr",
  "emb",
  "embe",
  "ember",
  "ember.",
];

const DELAYS = [300, 100, 110, 120, 130, 650, 140, 130, 130, 120, 400];

export default function TypewriterTitle() {
  const [frameIndex, setFrameIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (frameIndex >= FRAMES.length - 1) {
      setDone(true);
      return;
    }
    const timeout = setTimeout(
      () => setFrameIndex((i) => i + 1),
      DELAYS[frameIndex + 1]
    );
    return () => clearTimeout(timeout);
  }, [frameIndex]);

  return (
    <h1 className="mt-4 text-6xl font-bold tracking-tight text-white sm:text-8xl">
      {FRAMES[frameIndex]}
      <span
        className={`ml-1 inline-block h-[0.9em] w-[0.06em] translate-y-1 bg-white align-middle ${
          done ? "animate-pulse" : "opacity-80"
        }`}
        aria-hidden="true"
      />
    </h1>
  );
}
