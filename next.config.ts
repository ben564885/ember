import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // These are pure Node.js clients (native TCP/WebSocket transports) that
  // break when Turbopack tries to bundle them for the server runtime —
  // require them natively instead.
  serverExternalPackages: ["falkordb", "redis", "@laserdata/laser-sdk", "rocketride"],
};

export default nextConfig;
