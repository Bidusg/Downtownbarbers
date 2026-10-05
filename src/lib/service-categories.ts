/** Delt, server-/klient-nøytral hjelper for tjenestekategorier. */

/** Kategorien «Tillegg» (tilleggstjenester) sorteres alltid sist i kasse-lister. */
export function isAddonCategory(cat: string | undefined | null): boolean {
  return (cat ?? "").trim().toLowerCase() === "tillegg";
}
