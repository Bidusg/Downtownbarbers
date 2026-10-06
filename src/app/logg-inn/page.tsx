import { redirect } from "next/navigation";

/**
 * Egen innloggingsside er fjernet – innlogging skjer i popupen på forsiden.
 * Gamle lenker (e-poster, bokmerker, tilgangsvakter) sendes dit med popupen
 * åpen, og eventuelle beskjeder (tilgang / passord tilbakestilt) følger med.
 */
export default async function LoggInn({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string; neste?: string; tilbakestilt?: string }>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams({ login: "1" });
  if (sp.feil === "tilgang") q.set("feil", "tilgang");
  if (sp.tilbakestilt === "1") q.set("tilbakestilt", "1");
  redirect(`/?${q.toString()}`);
}
