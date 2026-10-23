import type { MetadataRoute } from "next";
import { seoUrl } from "@/lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = seoUrl();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/booking`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/butikk`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/personvern`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
