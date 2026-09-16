import {
  getDocuments,
  getDocumentCategories,
} from "@/lib/documents-queries";
import { uploadDocument, deleteDocument, downloadDocument } from "./actions";

export const dynamic = "force-dynamic";

const KATEGORI_FORSLAG = ["Kontrakt", "Rutine", "HMS", "Faktura", "Annet"];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function fmtSize(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AdminDokumenter({
  searchParams,
}: {
  searchParams: Promise<{
    kategori?: string;
    lastet?: string;
    feil?: string;
  }>;
}) {
  const sp = await searchParams;
  const active = sp.kategori?.trim() || "";

  const [docs, categories] = await Promise.all([
    getDocuments(active || undefined),
    getDocumentCategories(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Dokumentsenter</h1>
        <p className="mt-1 text-sm text-muted">
          Felles filarkiv for salongen — last opp, kategoriser, last ned og
          slett dokumenter. Kun synlig for administratorer, og filene lagres
          privat (nedlasting via tidsbegrensede lenker).
        </p>
      </div>

      {sp.lastet !== undefined && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">Dokumentet ble lastet opp.</strong>
          </p>
        </div>
      )}
      {sp.feil === "tomt" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Du må velge en fil.
        </div>
      )}
      {sp.feil === "opplasting" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Opplastingen feilet. Sjekk at filen ikke er for stor og prøv igjen.
        </div>
      )}
      {sp.feil === "nedlasting" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Kunne ikke lage nedlastingslenke. Prøv igjen.
        </div>
      )}

      {/* Last opp */}
      <form
        action={uploadDocument}
        className="space-y-4 border border-line bg-surface p-6"
      >
        <h2 className="font-display text-lg font-bold">Last opp dokument</h2>
        <div>
          <label className="mb-1 block text-xs text-muted">Fil</label>
          <input
            type="file"
            name="file"
            required
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">
            Visningsnavn{" "}
            <span className="text-muted/70">(valgfritt — bruker filnavn)</span>
          </label>
          <input
            name="name"
            placeholder="F.eks. Ansettelseskontrakt – mal 2026"
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Kategori</label>
          <input
            name="category"
            list="dok-kategorier"
            placeholder="F.eks. Kontrakt, Rutine, Annet"
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg sm:w-auto"
          />
          <datalist id="dok-kategorier">
            {[...new Set([...KATEGORI_FORSLAG, ...categories])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Last opp
          </button>
          <span className="text-xs text-muted">Filen lagres i privat arkiv.</span>
        </div>
      </form>

      {/* Filter + liste */}
      <div className="border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Dokumenter</h2>
          {categories.length > 0 && (
            <form method="get" className="flex items-center gap-2">
              <select
                name="kategori"
                defaultValue={active}
                className="border border-line-2 bg-canvas px-3 py-1.5 text-sm text-fg"
              >
                <option value="">Alle kategorier</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="border border-line-2 bg-surface-2 px-3 py-1.5 text-sm text-fg transition-opacity hover:opacity-90"
              >
                Filtrer
              </button>
            </form>
          )}
        </div>

        {docs.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">
            {active
              ? "Ingen dokumenter i denne kategorien."
              : "Ingen dokumenter enda."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Navn</th>
                  <th className="px-4 py-3 font-medium">Kategori</th>
                  <th className="px-4 py-3 text-right font-medium">Størrelse</th>
                  <th className="px-4 py-3 font-medium">Dato</th>
                  <th className="px-4 py-3 text-right font-medium">Handling</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3">
                      <span className="text-fg">{d.name}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {d.category ? (
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                          {d.category}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">
                      {fmtSize(d.size_bytes)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {fmtDate(d.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <form action={downloadDocument}>
                          <input type="hidden" name="path" value={d.path} />
                          <input type="hidden" name="name" value={d.name} />
                          <button
                            type="submit"
                            className="border border-line-2 bg-surface-2 px-3 py-1 text-xs text-fg transition-opacity hover:opacity-90"
                          >
                            Last ned
                          </button>
                        </form>
                        <form action={deleteDocument.bind(null, d.id)}>
                          <button
                            type="submit"
                            className="border border-danger/30 bg-danger/5 px-3 py-1 text-xs text-danger transition-opacity hover:opacity-90"
                          >
                            Slett
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        Arkivet er privat. Nedlasting skjer via en signert lenke som er gyldig i
        60 sekunder. Store filer kan avvises av serverens grense for
        opplastingsstørrelse.
      </p>
    </div>
  );
}
