import { requireRole } from "@/lib/auth";
import { getStaffOptions } from "@/lib/ops-queries";
import {
  getStaffDocuments,
  type StaffDocumentWithUrl,
  type DocCategory,
} from "@/lib/staff-documents";
import { StaffDocUploader } from "@/components/admin/StaffDocUploader";
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
    label: "Lønnslipper",
    hint: "Genereres av revisor – kun visning her.",
  },
  { key: "annet", label: "Andre dokumenter", hint: "Øvrige vedlegg." },
];

function DocRow({ d }: { d: StaffDocumentWithUrl }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-4 py-3">
        <span className="text-fg">{d.name}</span>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted">
        {fmtSize(d.size_bytes)}
      </td>
      <td className="px-4 py-3">
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
      </td>
    </tr>
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
      <div>
        <h1 className="font-display text-2xl font-bold">Ansattdokumenter</h1>
        <p className="mt-1 text-sm text-muted">
          Dokumenter per ansatt — kontrakter og andre vedlegg. Filene lagres
          privat, og åpnes via tidsbegrensede signerte lenker. Lønnslipper
          genereres av revisor og vises her, men lastes ikke opp av admin.
        </p>
      </div>

      {/* Velg ansatt */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 border border-line bg-surface p-6"
      >
        <div className="flex-1 min-w-[220px]">
          <label className="mb-1 block text-xs text-muted">Ansatt</label>
          <select
            name="staff"
            defaultValue={staffId}
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
          >
            <option value="">Velg ansatt …</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
                {s.title ? ` — ${s.title}` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
        >
          Vis
        </button>
      </form>

      {staff.length === 0 && (
        <p className="border border-line bg-surface px-6 py-8 text-sm text-muted">
          Ingen aktive ansatte funnet.
        </p>
      )}

      {!selected ? (
        staff.length > 0 && (
          <p className="border border-line bg-surface px-6 py-8 text-sm text-muted">
            Velg en ansatt for å se og laste opp dokumenter.
          </p>
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
              <div key={g.key} className="border border-line bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
                  <div>
                    <h3 className="font-display text-lg font-bold">{g.label}</h3>
                    <p className="text-xs text-muted">{g.hint}</p>
                  </div>
                  <span className="text-xs text-muted">{rows.length}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-6 py-6 text-sm text-muted">Ingen dokumenter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs text-muted">
                          <th className="px-4 py-3 font-medium">Navn</th>
                          <th className="px-4 py-3 text-right font-medium">
                            Størrelse
                          </th>
                          <th className="px-4 py-3 text-right font-medium">
                            Handling
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((d) => (
                          <DocRow key={d.id} d={d} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
