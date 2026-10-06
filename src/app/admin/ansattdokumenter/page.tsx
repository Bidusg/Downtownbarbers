import { requireRole } from "@/lib/auth";
import { getStaffOptions } from "@/lib/ops-queries";
import {
  getStaffDocuments,
  type StaffDocumentWithUrl,
  type DocCategory,
} from "@/lib/staff-documents";
import { StaffDocUploader } from "@/components/admin/StaffDocUploader";
import { ContractMigrationButton } from "@/components/admin/ContractMigrationButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Input";
import { deleteStaffDocument } from "./actions";

export const dynamic = "force-dynamic";

function fmtSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const GROUPS: { key: DocCategory; label: string; hint: string }[] = [
  { key: "kontrakt", label: "Kontrakt", hint: "Ansettelseskontrakter og tillegg." },
  {
    key: "lonnslipp",
    label: "Lønnsoversikt",
    hint: "Genereres av revisor – kun visning her.",
  },
  { key: "oppsigelse", label: "Oppsigelse", hint: "Oppsigelser (last opp her eller under Ansatte → Rediger)." },
  { key: "annet", label: "Andre dokumenter", hint: "Øvrige vedlegg." },
];

function DocRow({ d }: { d: StaffDocumentWithUrl }) {
  return (
    <Tr>
      <Td>
        <span className="text-fg">{d.name}</span>
      </Td>
      <Td align="right" nums className="text-muted">
        {fmtSize(d.size_bytes)}
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-2">
          {d.url ? (
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-line-2 bg-surface-2 px-3 py-1 text-xs text-fg transition-opacity hover:opacity-90"
            >
              Åpne
            </a>
          ) : (
            <span className="text-xs text-muted">Utilgjengelig</span>
          )}
          <form action={deleteStaffDocument.bind(null, d.id)}>
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
  );
}

export default async function AdminAnsattdokumenter({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  await requireRole(["admin"]);

  const sp = await searchParams;
  const staffId = sp.staff?.trim() || "";

  const staff = await getStaffOptions();
  const selected = staff.find((s) => s.id === staffId) ?? null;
  const docs = selected ? await getStaffDocuments(selected.id) : [];

  const byCategory = (cat: DocCategory) => docs.filter((d) => d.category === cat);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Ansattdokumenter"
        description="Dokumenter per ansatt — kontrakter og andre vedlegg. Filene lagres privat, og åpnes via tidsbegrensede signerte lenker. Lønnsoversikter genereres av revisor og vises her, men lastes ikke opp av admin."
      />

      <ContractMigrationButton />

      {/* Velg ansatt */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 border border-line bg-surface p-6"
      >
        <Field label="Ansatt" className="flex-1 min-w-[220px]">
          <Select name="staff" defaultValue={staffId}>
            <option value="">Velg ansatt …</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.title ? ` — ${s.title}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="px-5 py-2 text-sm">
          Vis
        </Button>
      </form>

      {staff.length === 0 && (
        <EmptyState description="Ingen aktive ansatte funnet." />
      )}

      {!selected ? (
        staff.length > 0 && (
          <EmptyState description="Velg en ansatt for å se og laste opp dokumenter." />
        )
      ) : (
        <div className="space-y-8">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl font-bold">
              {selected.full_name}
            </h2>
            {selected.title && (
              <p className="text-sm text-muted">{selected.title}</p>
            )}
          </div>

          <StaffDocUploader staffId={selected.id} />

          {GROUPS.map((g) => {
            const rows = byCategory(g.key);
            return (
              <Card key={g.key} padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
                  <div>
                    <h3 className="font-display text-lg font-bold">{g.label}</h3>
                    <p className="text-xs text-muted">{g.hint}</p>
                  </div>
                  <Badge tone="neutral">{rows.length}</Badge>
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted">Ingen dokumenter.</p>
                ) : (
                  <Table>
                    <THead>
                      <Tr head>
                        <Th>Navn</Th>
                        <Th align="right">Størrelse</Th>
                        <Th align="right">Handling</Th>
                      </Tr>
                    </THead>
                    <TBody>
                      {rows.map((d) => (
                        <DocRow key={d.id} d={d} />
                      ))}
                    </TBody>
                  </Table>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
