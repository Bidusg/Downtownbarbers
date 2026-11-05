import { requireRole } from "@/lib/auth";
import { getStaffOptions } from "@/lib/ops-queries";
import {
  getStaffDocuments,
  type StaffDocumentWithUrl,
  type DocCategory,
} from "@/lib/staff-documents";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Select } from "@/components/ui/Input";
import { DocViewerButton } from "@/components/ui/DocViewer";

export const dynamic = "force-dynamic";

function fmtSize(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("nb-NO", { timeZone: "Europe/Oslo", day: "2-digit", month: "2-digit", year: "numeric" });

const GROUPS: { key: DocCategory; label: string }[] = [
  { key: "kontrakt", label: "Kontrakt" },
  { key: "lonnslipp", label: "Lønnsoversikt" },
  { key: "oppsigelse", label: "Oppsigelse" },
  { key: "annet", label: "Andre dokumenter" },
];

function DocRow({ d }: { d: StaffDocumentWithUrl }) {
  return (
    <Tr>
      <Td>
        <span className="text-fg">{d.name}</span>
        {d.period && <span className="ml-2 text-xs text-muted">{d.period}</span>}
      </Td>
      <Td nums muted>{fmtDate(d.created_at)}</Td>
      <Td align="right" nums className="text-muted">{fmtSize(d.size_bytes)}</Td>
      <Td>
        <div className="flex items-center justify-end gap-3">
          {d.url ? (
            <>
              <DocViewerButton filename={d.name} url={d.url} mime={d.mime} />
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-line-2 bg-surface-2 px-3 py-1 text-xs text-fg transition-opacity hover:opacity-90"
              >
                Åpne
              </a>
            </>
          ) : (
            <span className="text-xs text-muted">Utilgjengelig</span>
          )}
        </div>
      </Td>
    </Tr>
  );
}

/**
 * Ansattdokumenter for revisor (kun lesing): kontrakter, lønnsoversikter,
 * oppsigelser og andre vedlegg per ansatt – også for ansatte som har sluttet.
 * Opplasting og sletting gjøres av admin.
 */
export default async function RevisorDokumenter({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  await requireRole(["revisor", "admin"]);
  const sp = await searchParams;
  const staffId = sp.staff?.trim() || "";

  const staff = await getStaffOptions({ includeInactive: true });
  const selected = staff.find((s) => s.id === staffId) ?? null;
  const docs = selected ? await getStaffDocuments(selected.id) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Ansattdokumenter"
        description="Kontrakter, lønnsoversikter, oppsigelser og andre vedlegg per ansatt. Kun lesing – filene åpnes via tidsbegrensede lenker. Admin laster opp og sletter."
      />

      <form method="get" className="flex flex-wrap items-end gap-3 border border-line bg-surface p-6">
        <Field label="Ansatt" className="min-w-[220px] flex-1">
          <Select name="staff" defaultValue={staffId}>
            <option value="">Velg ansatt …</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.title ? ` — ${s.title}` : ""}
                {s.active === false ? " (sluttet)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" className="px-5 py-2 text-sm">Vis</Button>
      </form>

      {!selected ? (
        <EmptyState description="Velg en ansatt for å se dokumentene." />
      ) : (
        <div className="space-y-8">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl font-bold">{selected.full_name}</h2>
            {selected.title && <p className="text-sm text-muted">{selected.title}</p>}
          </div>

          {GROUPS.map((g) => {
            const rows = docs.filter((d) => d.category === g.key);
            return (
              <Card key={g.key} padded={false}>
                <div className="flex items-center justify-between gap-2 border-b border-line px-6 py-4">
                  <h3 className="font-display text-lg font-bold">{g.label}</h3>
                  <Badge tone="neutral">{rows.length}</Badge>
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted">Ingen dokumenter.</p>
                ) : (
                  <Table>
                    <THead>
                      <Tr head>
                        <Th>Navn</Th>
                        <Th>Lagt inn</Th>
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
