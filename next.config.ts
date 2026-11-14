import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
  outputFileTracingIncludes: {
    "/api/news-podcast/render": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
