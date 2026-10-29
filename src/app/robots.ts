import type { MetadataRoute } from "next";
import { seoUrl } from "@/lib/site-url";

// Offentlige sider indekseres; back-office, tokeniserte kundesider og API
// holdes utenfor søkemotorene.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/kasse",
          "/ansatt",
          "/revisor",
          "/api/",
          "/min-side/",
          "/avbestill/",
          "/avmeld/",
          "/vurder/",
          "/logg-inn",
          "/glemt-passord",
          "/tilbakestill",
          "/sjekk-epost",
          "/q/",
          "/tilbud",
        ],
      },
    ],
    sitemap: `${seoUrl()}/sitemap.xml`,
  };
}
