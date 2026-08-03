import Image from "next/image";
import Link from "next/link";
import TypewriterTitle from "@/components/TypewriterTitle";

const SPONSORS = [
  { name: "FalkorDB", src: "/logos/falkor.svg" },
  { name: "Guild", src: "/logos/guild.png" },
  { name: "LaserData", src: "/logos/laserdata.png" },
  { name: "RocketRide", src: "/logos/rocketride.png" },
];

export default function Landing() {
  return (
    <div className="fixed inset-0 overflow-hidden">
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-bg-poster.jpg"
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      >
        <source src="/hero-bg.mp4" type="video/mp4" />
      </video>

      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/60" />

      <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-300">
          Memory meets motion · 2026
        </span>
        <TypewriterTitle />
        <p className="mt-5 max-w-lg text-base text-neutral-200 sm:text-lg">
          The deal-flow graph that watches for the moment a pass is worth another look.
        </p>

        <Link
          href="/app"
          className="mt-10 inline-flex items-center gap-2 rounded-full bg-blue-600 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/40 transition hover:bg-blue-500"
        >
          Judges click here
          <span aria-hidden="true">→</span>
        </Link>

        <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
            Built with
          </span>
          <div className="flex items-center gap-8">
            {SPONSORS.map((sponsor) => (
              <Image
                key={sponsor.name}
                src={sponsor.src}
                alt={sponsor.name}
                title={sponsor.name}
                width={36}
                height={36}
                className="h-8 w-8 object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 sm:h-9 sm:w-9"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
