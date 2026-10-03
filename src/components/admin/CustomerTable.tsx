import type { AdminCustomer } from "@/lib/admin-queries";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

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
      <form method="get" action={basePath} className="mb-4 flex flex-wrap gap-2">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Søk på navn, e-post eller telefon…"
          className="min-w-0 flex-1 sm:max-w-sm sm:flex-none sm:w-80"
        />
        <Button type="submit" className="px-5 py-2.5 text-sm">
          Søk
        </Button>
        {q && (
          <a
            href={basePath}
            className="flex items-center px-3 py-2.5 text-sm text-muted hover:text-fg"
          >
            Nullstill
          </a>
        )}
      </form>

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Navn</Th>
              <Th>Kontakt</Th>
              <Th>Bookinger</Th>
              <Th>Sist</Th>
              <Th>Brukt</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {customers.length === 0 && (
              <TableEmpty colSpan={6}>
                {total === 0 && !q
                  ? "Ingen kunder enda. De registreres ved booking, eller importer kundekartoteket."
                  : "Ingen treff."}
              </TableEmpty>
            )}
            {customers.map((c) => (
              <Tr key={c.id} className="hover:bg-surface-2/50">
                <Td>
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
                    <Badge tone="danger" className="ml-2">
                      {c.noShows} ikke møtt
                    </Badge>
                  )}
                </Td>
                <Td className="text-xs">
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
                </Td>
                <Td className="font-display">{c.visits}</Td>
                <Td muted>{fmtDate(c.lastVisit)}</Td>
                <Td className="font-display">
                  {c.totalSpent > 0 ? `${c.totalSpent} kr` : "—"}
                </Td>
                <Td align="right">
                  <a
                    href={`${basePath}/${c.id}`}
                    className="text-xs font-semibold text-muted hover:text-fg"
                  >
                    Åpne →
                  </a>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {/* Paginering */}
      <div className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>
          {total === 0 ? "0 kunder" : `Viser ${from}–${to} av ${total}`}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <a
              href={pageHref(basePath, q, page - 1)}
              className="rounded-md border border-line px-4 py-2.5 text-fg hover:border-accent-soft"
            >
              ← Forrige
            </a>
          ) : (
            <span className="rounded-md border border-line px-4 py-2.5 opacity-40">
              ← Forrige
            </span>
          )}
          <span className="px-1">
            Side {page} av {totalPages}
          </span>
          {page < totalPages ? (
            <a
              href={pageHref(basePath, q, page + 1)}
              className="rounded-md border border-line px-4 py-2.5 text-fg hover:border-accent-soft"
            >
              Neste →
            </a>
          ) : (
            <span className="rounded-md border border-line px-4 py-2.5 opacity-40">
              Neste →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
