import {
  getDocuments,
  getDocumentCategories,
} from "@/lib/documents-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Field } from "@/components/ui/Input";
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
      <PageHeader
        title="Dokumentsenter"
        description="Felles filarkiv for salongen — last opp, kategoriser, last ned og slett dokumenter. Kun synlig for administratorer, og filene lagres privat (nedlasting via tidsbegrensede lenker)."
      />

      {sp.lastet !== undefined && (
        <EmptyState title="Dokumentet ble lastet opp." />
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
        <Field label="Fil">
          <Input
            type="file"
            name="file"
            required
            className="file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
          />
        </Field>
        <Field label="Visningsnavn" hint="(valgfritt — bruker filnavn)">
          <Input
            name="name"
            placeholder="F.eks. Ansettelseskontrakt – mal 2026"
          />
        </Field>
        <Field label="Kategori">
          <Input
            name="category"
            list="dok-kategorier"
            placeholder="F.eks. Kontrakt, Rutine, Annet"
            className="sm:w-auto"
          />
          <datalist id="dok-kategorier">
            {[...new Set([...KATEGORI_FORSLAG, ...categories])].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" className="px-5 py-2 text-sm">
            Last opp
          </Button>
          <span className="text-xs text-muted">Filen lagres i privat arkiv.</span>
        </div>
      </form>

      {/* Filter + liste */}
      <Card padded={false}>
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
          <Table>
            <THead>
              <Tr head>
                <Th>Navn</Th>
                <Th>Kategori</Th>
                <Th align="right">Størrelse</Th>
                <Th>Dato</Th>
                <Th align="right">Handling</Th>
              </Tr>
            </THead>
            <TBody>
              {docs.map((d) => (
                <Tr key={d.id}>
                  <Td>
                    <span className="text-fg">{d.name}</span>
                  </Td>
                  <Td muted>
                    {d.category ? <Badge>{d.category}</Badge> : "—"}
                  </Td>
                  <Td align="right" nums muted>
                    {fmtSize(d.size_bytes)}
                  </Td>
                  <Td muted className="whitespace-nowrap">
                    {fmtDate(d.created_at)}
                  </Td>
                  <Td>
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
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted">
        Arkivet er privat. Nedlasting skjer via en signert lenke som er gyldig i
        60 sekunder. Store filer kan avvises av serverens grense for
        opplastingsstørrelse.
      </p>
    </div>
  );
}
