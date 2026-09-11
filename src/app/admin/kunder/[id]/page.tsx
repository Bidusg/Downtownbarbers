import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/admin-queries";
import { updateCustomer } from "../actions";

const statusLabel: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avbestilt",
  no_show: "Ikke møtt",
};

const statusStyle: Record<string, string> = {
  confirmed: "bg-accent-soft/15 text-accent-soft",
  completed: "bg-accent-soft/15 text-accent-soft",
  cancelled: "bg-surface-2 text-danger",
  pending: "bg-surface-2 text-muted",
  no_show: "bg-surface-2 text-danger",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

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

function Stat({
  label,
  value,
  danger,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="border border-line bg-surface p-4">
      <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
        {label}
      </p>
      <p
        className={
          "mt-1 font-display text-xl font-bold " +
          (danger ? "text-danger" : "text-fg")
        }
      >
        {value}
      </p>
    </div>
  );
}

export default async function KundeKort({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lagret?: string }>;
}) {
  const { id } = await params;
  const { lagret } = await searchParams;
  const c = await getCustomer(id);
  if (!c) notFound();
  const save = updateCustomer.bind(null, id);
  const banner =
    lagret === "ok"
      ? { text: "Lagret ✓", ok: true }
      : lagret === "e-post-finnes"
        ? { text: "E-posten er allerede i bruk på en annen kunde.", ok: false }
        : lagret === "feil"
          ? { text: "Kunne ikke lagre – prøv igjen.", ok: false }
          : null;

  return (
    <div className="mx-auto max-w-4xl">
      <a href="/admin/kunder" className="text-xs text-muted hover:text-fg">
        ← Tilbake til kundekartotek
      </a>
      <div className="mt-3 mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">{c.full_name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            Kunde siden {fmtDate(c.created_at)}
          </span>
          <a
            href={`/admin/kunder/${id}/kjopshistorikk`}
            className="inline-flex items-center gap-1.5 border border-line-2 px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Kjøpshistorikk (PDF)
          </a>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bookinger" value={String(c.visits)} />
        <Stat label="Sist besøk" value={fmtDate(c.lastVisit)} />
        <Stat
          label="Totalt brukt"
          value={c.totalSpent > 0 ? `${c.totalSpent} kr` : "—"}
        />
        <Stat
          label="Ikke møtt"
          value={String(c.noShows)}
          danger={c.noShows > 0}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <form action={save} className="space-y-3 border border-line bg-surface p-4">
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Rediger kunde
          </h2>
          {banner && (
            <p
              className={
                "px-3 py-2 text-xs font-semibold " +
                (banner.ok
                  ? "bg-accent-soft/15 text-accent-soft"
                  : "bg-danger/10 text-danger")
              }
            >
              {banner.text}
            </p>
          )}
          {(["full_name", "phone", "email", "category"] as const).map((f) => {
            const meta = {
              full_name: { label: "Navn", val: c.full_name, ph: "Fullt navn", type: "text" },
              phone: { label: "Telefon", val: c.phone ?? "", ph: "8 siffer", type: "tel" },
              email: { label: "E-post", val: c.email ?? "", ph: "navn@epost.no", type: "email" },
              category: { label: "Kategori", val: c.category ?? "", ph: "f.eks. Stamkunde, VIP", type: "text" },
            }[f];
            return (
              <div key={f}>
                <label className="mb-1 block text-xs text-muted">{meta.label}</label>
                <input
                  name={f}
                  type={meta.type}
                  defaultValue={meta.val}
                  placeholder={meta.ph}
                  className="w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
                />
              </div>
            );
          })}
          <div>
            <label className="mb-1 block text-xs text-muted">Notater</label>
            <textarea
              name="notes"
              defaultValue={c.notes ?? ""}
              rows={5}
              placeholder="Preferanser, allergier, ønsket barber …"
              className="w-full resize-y border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              Lagre
            </button>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="text-xs text-muted hover:text-fg">
                Ring
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-xs text-muted hover:text-fg">
                Send e-post
              </a>
            )}
          </div>
        </form>

        <div className="border border-line">
          <h2 className="border-b border-line bg-surface-2 px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Bookinghistorikk
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {c.bookings.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted">
                      Ingen bookinger enda.
                    </td>
                  </tr>
                )}
                {c.bookings.map((b) => (
                  <tr key={b.id} className="border-t border-line">
                    <td className="px-4 py-3 whitespace-nowrap text-fg">
                      {fmt(b.start_at)}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {b.service}
                      <span className="block text-xs">hos {b.barber}</span>
                    </td>
                    <td className="px-4 py-3 font-display whitespace-nowrap">
                      {b.price_nok} kr
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                          (statusStyle[b.status] ?? "bg-surface-2 text-muted")
                        }
                      >
                        {statusLabel[b.status] ?? b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
