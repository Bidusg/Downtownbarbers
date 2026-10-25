import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShopProduct } from "@/lib/shop";
import { getMemberProfile } from "@/lib/member";
import { seoUrl } from "@/lib/site-url";
import { ProductDetail } from "@/components/shop/ProductDetail";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getShopProduct(slug);
  if (!p) return { title: "Fant ikke produktet | Downtown Barbers" };
  const title = `${p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase()) ? `${p.brand} ` : ""}${p.name} | Downtown Barbers`;
  const description = (p.short || p.description || "").slice(0, 160);
  return {
    title,
    description,
    alternates: { canonical: `/butikk/${p.slug}` },
    openGraph: { title, description, images: p.images[0] ? [p.images[0]] : undefined },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const [p, member] = await Promise.all([getShopProduct(slug), getMemberProfile()]);
  if (!p || p.isGiftCard) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    description: p.short || p.description || undefined,
    image: p.images.length ? p.images : undefined,
    category: p.category || undefined,
    offers: {
      "@type": "Offer",
      url: `${seoUrl()}/butikk/${p.slug}`,
      priceCurrency: "NOK",
      price: p.price.toFixed(2),
      availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Downtown Barbers" },
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ProductDetail
        product={p}
        member={member && member.productPct > 0 ? { tier: member.tierName ?? "", pct: member.productPct } : null}
      />
    </>
  );
}
