import { getMyStaffLink } from "@/lib/ansatt-queries";
import {
  getMyDocuments,
  type StaffDocumentWithUrl,
} from "@/lib/staff-documents";
import { DocumentUploadForm } from "@/components/ansatt/DocumentUploadForm";
import { DeleteDocumentButton } from "@/components/ansatt/DeleteDocumentButton";

export const dynamic = "force-dynamic";

const MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

/** YYYY-MM → «September 2026». Faller tilbake til rå verdi ved uventet format. */
function fmtPeriod(period: string | null): string | null {
  if (!period) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (!m) return period;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const name = MONTHS[monthIdx];
  if (!name) return period;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function fmtSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function DownloadLink({ doc }: { doc: StaffDocumentWithUrl }) {
  if (!doc.url) {
    return <span className="text-xs text-muted">Utilgjengelig</span>;
  }
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-semibold text-accent-soft underline-offset-2 hover:underline"
    >
      Last ned
    </a>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-line bg-surface px-4 py-6 text-center text-sm text-muted">
      {text}
    </div>
  );
}

export default async function AnsattDokumenter() {
  const [link, docs] = await Promise.all([getMyStaffLink(), getMyDocuments()]);

  const contracts = docs.filter((d) => d.category === "kontrakt");
  const payslips = docs
    .filter((d) => d.category === "lonnslipp")
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""));
  const others = docs.filter((d) => d.category === "annet");

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="font-display text-xl font-bold">Mine dokumenter</h1>
        <p className="mt-1 text-sm text-muted">
          Kontrakt, lønnslipper og andre dokumenter – kun synlig for deg og
          ledelsen.
        </p>
      </div>

      {!link.linked ? (
        <div className="border border-line bg-surface px-4 py-8 text-center text-sm text-muted">
          Kontoen din er ikke koblet til en ansattprofil enda. Be admin sette
          e-posten din på din ansatt-rad, så vises dokumentene dine her.
        </div>
      ) : (
        <>
          {/* Kontrakt */}
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Kontrakt
            </h2>
            {contracts.length === 0 ? (
              <EmptyState text="Ingen kontrakt lastet opp." />
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {contracts.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="text-fg">{d.name}</span>
                    {fmtSize(d.size_bytes) && (
                      <span className="text-xs text-muted">
                        {fmtSize(d.size_bytes)}
                      </span>
                    )}
                    <span className="ml-auto">
                      <DownloadLink doc={d} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Lønnslipper */}
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Lønnslipper
            </h2>
            {payslips.length === 0 ? (
              <EmptyState text="Ingen lønnslipper enda." />
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {payslips.map((d) => {
                  const period = fmtPeriod(d.period);
                  return (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                    >
                      <span className="text-fg">{period ?? d.name}</span>
                      {period && d.name !== period && (
                        <span className="text-xs text-muted">{d.name}</span>
                      )}
                      {fmtSize(d.size_bytes) && (
                        <span className="text-xs text-muted">
                          {fmtSize(d.size_bytes)}
                        </span>
                      )}
                      <span className="ml-auto">
                        <DownloadLink doc={d} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Andre dokumenter */}
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Andre dokumenter
            </h2>

            <div className="mb-4 border border-line bg-surface p-5">
              <DocumentUploadForm />
            </div>

            {others.length === 0 ? (
              <EmptyState text="Ingen andre dokumenter." />
            ) : (
              <ul className="divide-y divide-line border border-line bg-surface">
                {others.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="text-fg">{d.name}</span>
                    {fmtSize(d.size_bytes) && (
                      <span className="text-xs text-muted">
                        {fmtSize(d.size_bytes)}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-4">
                      <DownloadLink doc={d} />
                      {d.by_staff && <DeleteDocumentButton id={d.id} />}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
