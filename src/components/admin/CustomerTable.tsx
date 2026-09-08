import type { AdminCustomer } from "@/lib/admin-queries";
import { Avatar } from "@/components/ui/Avatar";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function pageHref(basePath: string, q: string, page: number) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/**
 * Kundekartotek-tabell. Server-drevet søk (GET-skjema) og paginering,
 * slik at den skalerer til tusenvis av kunder.
 */
export function CustomerTable({
  customers,
  total,
  page,
  pageSize,
  q = "",
  basePath = "/admin/kunder",
}: {
  customers: AdminCustomer[];
  total: number;
  page: number;
  pageSize: number;
  q?: string;
  basePath?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div>
      <form method="get" action={basePath} className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Søk på navn, e-post eller telefon…"
          className="w-full max-w-sm border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
        />
        <button
          type="submit"
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          Søk
        </button>
        {q && (
          <a
            href={basePath}
            className="flex items-center px-3 text-sm text-muted hover:text-fg"
          >
            Nullstill
          </a>
        )}
      </form>

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Bookinger</th>
              <th className="px-4 py-3">Sist</th>
              <th className="px-4 py-3">Brukt</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {total === 0 && !q
                    ? "Ingen kunder enda. De registreres ved booking, eller importer kundekartoteket."
                    : "Ingen treff."}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr
                key={c.id}
                className="border-t border-line hover:bg-surface-2/50"
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2.5">
                    <Avatar name={c.full_name} colorKey={c.id} size={28} />
                    <a
                      href={`${basePath}/${c.id}`}
                      className="font-medium text-fg hover:text-accent-soft hover:underline"
                    >
                      {c.full_name}
                    </a>
                  </span>
                  {c.noShows > 0 && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-danger">
                      {c.noShows} ikke møtt
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="flex flex-col gap-0.5">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="text-accent-soft hover:underline"
                      >
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-muted hover:text-fg hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                    {!c.phone && !c.email && (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 font-display">{c.visits}</td>
                <td className="px-4 py-3 text-muted">{fmtDate(c.lastVisit)}</td>
                <td className="px-4 py-3 font-display">
                  {c.totalSpent > 0 ? `${c.totalSpent} kr` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`${basePath}/${c.id}`}
                    className="text-xs font-semibold text-muted hover:text-fg"
                  >
                    Åpne →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginering */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>
          {total === 0 ? "0 kunder" : `Viser ${from}–${to} av ${total}`}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <a
              href={pageHref(basePath, q, page - 1)}
              className="border border-line px-3 py-1.5 text-fg hover:border-accent-soft"
            >
              ← Forrige
            </a>
          ) : (
            <span className="border border-line px-3 py-1.5 opacity-40">
              ← Forrige
            </span>
          )}
          <span className="px-1">
            Side {page} av {totalPages}
          </span>
          {page < totalPages ? (
            <a
              href={pageHref(basePath, q, page + 1)}
              className="border border-line px-3 py-1.5 text-fg hover:border-accent-soft"
            >
              Neste →
            </a>
          ) : (
            <span className="border border-line px-3 py-1.5 opacity-40">
              Neste →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
