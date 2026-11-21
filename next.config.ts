import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingExcludes: { "/*": ["./artifacts/**"] },
};
export default config;
