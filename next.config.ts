import type { NextConfig } from "next";

// Sikkerhetsheadere for alle sider. CSP-en er bevisst «praktisk»: Next
// hydrerer med inline-script, så script-src trenger 'unsafe-inline'; men alle
// EKSTERNE script-kilder er sperret (det er det som stopper injiserte
// skript fra å laste kode utenfra), og frame-ancestors 'self' stopper
// clickjacking av kasse/admin fra fremmede sider. Tredjeparter som faktisk brukes: Supabase
// (API + storage-bilder), Google-profilbilder fra anmeldelser.
const SUPABASE_HOST = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();
const supabaseSrc = SUPABASE_HOST ? `https://${SUPABASE_HOST} wss://${SUPABASE_HOST}` : "https://*.supabase.co wss://*.supabase.co";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Bilder: egne + Supabase storage + Google-profilbilder (anmeldelser) + data/blob (strekkode/PDF).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseSrc}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:", // PDF-forhåndsvisning (blob)
  // 'self': admin-forhåndsvisningen av forsiden (SitePreview) er en iframe på egen origin.
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kamera: strekkodeskanner i kassa (egen origin). Resten av.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
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
