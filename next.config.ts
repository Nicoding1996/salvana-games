import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js gzips every response on the server's own CPU. On a host whose edge already
  // compresses (Render, Fly.io, anything behind Cloudflare), set HOST_COMPRESSES=1 so the
  // server skips that work. Anywhere else, leave it unset and Next.js keeps compressing.
  compress: process.env.HOST_COMPRESSES !== '1',
};

export default nextConfig;
