import type { MetadataRoute } from "next";
import { seoUrl } from "@/lib/site-url";
import { getShopProducts, getWebshopSettings } from "@/lib/shop";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = seoUrl();
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/booking`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/butikk`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/kjopsvilkar`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/personvern`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
  // Produktsidene tas med først når nettbutikken er åpnet.
  try {
    const s = await getWebshopSettings();
    if (s.live) {
      const products = await getShopProducts();
      for (const p of products) pages.push({ url: `${base}/butikk/${p.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.5 });
    }
  } catch {
    /* bare faste sider */
  }
  return pages;
}
