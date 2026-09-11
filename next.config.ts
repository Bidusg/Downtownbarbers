import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (og fontkit) skal kjøre som ekstern Node-pakke på
  // serveren, ikke bundles – gir stabil PDF-generering på Vercel.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
