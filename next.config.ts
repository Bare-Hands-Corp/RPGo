import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Evita warning de "multiple lockfiles" — força workspace root no projeto.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
