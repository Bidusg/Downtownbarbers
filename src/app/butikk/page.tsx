import { Catalog } from "@/components/shop/Catalog";

export const metadata = {
  title: "Nettbutikk – hårprodukter og skjeggpleie | Downtown Barbers",
  description:
    "Voks, pomade, skjeggolje, barberutstyr og hårpleie – de samme produktene barberne våre bruker. Hent i salongen i Oslo eller få det sendt. Gratis frakt over 599 kr.",
};

export default async function ButikkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kategori?: string; merke?: string }>;
}) {
  const sp = await searchParams;
  return <Catalog initialQuery={sp.q ?? ""} initialCategory={sp.kategori ?? ""} initialBrand={sp.merke ?? ""} />;
}
