import { Catalog } from "@/components/shop/Catalog";

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
  const sp = await searchParams;
  const initial: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(sp)) initial[k] = Array.isArray(v) ? v[0] : v;
  return <Catalog initial={initial} />;
}
