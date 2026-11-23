import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both OE packages ship ESM that Next has to process itself. This mirrors the
  // configuration real consumers use (see open-crm), so the harness exercises
  // the same build path they do.
  transpilePackages: ["@open-elements/ui", "@open-elements/nextjs-app-layer"],
};

export default nextConfig;
