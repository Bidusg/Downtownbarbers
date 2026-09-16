import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (og fontkit) skal kjøre som ekstern Node-pakke på
  // serveren, ikke bundles – gir stabil PDF-generering på Vercel.
  serverExternalPackages: ["@react-pdf/renderer", "exceljs"],
  experimental: {
    // Dokumentopplasting (DocCenter) går via server action. Standardgrensa er
    // 1 MB; hev til 4 MB (Vercels serverless-grense for request-body er ~4,5 MB
    // – større filer krever direkte opplasting til Storage, en senere utvidelse).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
