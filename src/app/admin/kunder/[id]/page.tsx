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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right text-fg">{children}</dd>
    </div>
  );
}

export default async function KundeKort({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();
  const save = updateCustomer.bind(null, id);

  return (
    <div className="mx-auto max-w-4xl">
      <a href="/admin/kunder" className="text-xs text-muted hover:text-fg">
        ← Tilbake til kundekartotek
      </a>
      <div className="mt-3 mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">{c.full_name}</h1>
        <span className="text-sm text-muted">
          Kunde siden {fmtDate(c.created_at)}
        </span>
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
        <div className="space-y-4">
          <div className="border border-line bg-surface p-4">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Kontakt
            </h2>
            <dl className="space-y-2 text-sm">
              <Field label="Telefon">
                {c.phone ? (
                  <a
                    href={`tel:${c.phone}`}
                    className="text-accent-soft hover:underline"
                  >
                    {c.phone}
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="E-post">
                {c.email ? (
                  <a
                    href={`mailto:${c.email}`}
                    className="text-accent-soft hover:underline"
                  >
                    {c.email}
                  </a>
                ) : (
                  "—"
                )}
              </Field>
            </dl>
          </div>

          <form action={save} className="border border-line bg-surface p-4">
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
              Notater & kategori
            </h2>
            <label className="mb-1 block text-xs text-muted">Kategori</label>
            <input
              name="category"
              defaultValue={c.category ?? ""}
              placeholder="f.eks. Stamkunde, VIP"
              className="mb-3 w-full border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
            />
            <label className="mb-1 block text-xs text-muted">Notater</label>
            <textarea
              name="notes"
              defaultValue={c.notes ?? ""}
              rows={5}
              placeholder="Preferanser, allergier, ønsket barber …"
              className="mb-3 w-full resize-y border border-line bg-canvas px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
            />
            <button
              type="submit"
              className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
            >
              Lagre
            </button>
          </form>
        </div>

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
