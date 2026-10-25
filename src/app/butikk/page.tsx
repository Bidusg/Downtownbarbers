import { redirect } from "next/navigation";
import { ShopLanding } from "@/components/shop/ShopLanding";
import { catUrl } from "@/lib/shop-shared";

export const metadata = {
  title: "Nettbutikk – hårprodukter og skjeggpleie | Downtown Barbers",
  description:
    "Voks, pomade, skjeggolje, barberutstyr og hårpleie – de samme produktene barberne våre bruker. Hent i salongen i Oslo eller få det sendt. Gratis frakt over 599 kr.",
};

export default async function ButikkPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Gamle lenker (/butikk?kategori=har&type=pomade …) → nye kategorisider.
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const rest = new URLSearchParams();
  for (const k of ["behov", "q", "merke", "hold", "finish", "pris", "lager", "sorter"]) {
    const v = one(k);
    if (v) rest.set(k, v);
  }
  if (one("kategori") || one("vis") || rest.size) redirect(catUrl(one("kategori") ?? null, one("type") ?? null, rest.toString() || undefined));
  return <ShopLanding />;
}
