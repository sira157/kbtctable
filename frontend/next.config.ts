import type { NextConfig } from "next";

// /api is proxied to the backend by middleware.ts (after the login check, adding the backend secret)
const nextConfig: NextConfig = {};

export default nextConfig;
