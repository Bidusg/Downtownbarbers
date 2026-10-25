import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Catalog } from "@/components/shop/Catalog";
import { TAXONOMY } from "@/lib/shop-shared";

/* /butikk/kategori/har, /butikk/kategori/har/pomade, /butikk/kategori/alle */

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resolve(path: string[]) {
  const [d, sub] = path;
  if (path.length > 2) return null;
  if (d === "alle") return path.length === 1 ? { dept: null, sub: null } : null;
  const dept = TAXONOMY.find((x) => x.key === d);
  if (!dept) return null;
  if (sub && !dept.subs.some((x) => x.key === sub)) return null;
  return { dept, sub: sub ? dept.subs.find((x) => x.key === sub)! : null };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = resolve((await params).path);
  if (!r) return { title: "Fant ikke siden | Downtown Barbers" };
  const name = r.sub ? r.sub.no : r.dept ? r.dept.no : "Alle produkter";
  return {
    title: `${name} – nettbutikk | Downtown Barbers`,
    description: r.dept ? r.dept.introNo : "Alle produktene i nettbutikken til Downtown Barbers.",
    alternates: { canonical: `/butikk/kategori/${(await params).path.join("/")}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { path } = await params;
  const r = resolve(path);
  if (!r) notFound();
  const sp = await searchParams;
  const initial: Record<string, string | undefined> = {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const one = Array.isArray(v) ? v[0] : v;
    initial[k] = one;
    if (one) qs.set(k, one);
  }
  // Ny adresse (også bare nye filtre fra menyen) = frisk katalog.
  return <Catalog key={`${path.join("/")}?${qs}`} deptKey={r.dept?.key ?? null} subKey={r.sub?.key ?? null} initial={initial} />;
}
