import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCustomer } from "@/lib/admin-queries";
import { getBarbers, getServices } from "@/lib/shop-queries";
import { DeskBooking } from "@/components/kasse/DeskBooking";
import { SendReceiptButton } from "@/components/kasse/SendReceiptButton";

export const dynamic = "force-dynamic";

const statusLabel: Record<string, string> = {
  pending: "Venter",
  confirmed: "Bekreftet",
  completed: "Fullført",
  cancelled: "Avlyst",
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

export default async function KasseKunde({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["shop", "admin"]);
  const { id } = await params;
  const [c, barbers, services] = await Promise.all([
    getCustomer(id),
    getBarbers(),
    getServices(),
  ]);
  if (!c) notFound();

  const last = c.bookings[0];

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Kunde</p>
        </div>
        <Link href="/kasse/kunder" className="text-sm text-muted hover:text-fg">
          ← Kunder
        </Link>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{c.full_name}</h1>
            <p className="mt-1 text-sm text-muted">
              {c.email ? (
                <a
                  href={`mailto:${c.email}`}
                  className="text-accent-soft hover:underline"
                >
                  {c.email}
                </a>
              ) : (
                "Ingen e-post"
              )}
            </p>
          </div>
          <DeskBooking
            services={services}
            barbers={barbers}
            label="Book ny time"
            prefill={{
              customerId: c.id,
              customerName: c.full_name,
              service: last?.service,
              barber: last?.barber,
            }}
          />
        </div>

        <div className="mb-6 grid grid-cols-3 gap-3">
          <div className="border border-line bg-surface p-4">
            <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
              Besøk
            </p>
            <p className="mt-1 font-display text-xl font-bold">{c.visits}</p>
          </div>
          <div className="border border-line bg-surface p-4">
            <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
              Sist
            </p>
            <p className="mt-1 font-display text-xl font-bold">
              {last ? fmt(last.start_at).split(",")[0] : "—"}
            </p>
          </div>
          <div className="border border-line bg-surface p-4">
            <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">
              Ikke møtt
            </p>
            <p
              className={
                "mt-1 font-display text-xl font-bold " +
                (c.noShows > 0 ? "text-danger" : "")
              }
            >
              {c.noShows}
            </p>
          </div>
        </div>

        <div className="border border-line">
          <h2 className="border-b border-line bg-surface-2 px-4 py-3 text-xs font-semibold tracking-wide text-muted uppercase">
            Behandlingshistorikk
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {c.bookings.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted">
                      Ingen timer enda.
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
                    <td className="px-4 py-3 text-right">
                      {b.status === "completed" && c.email && (
                        <SendReceiptButton bookingId={b.id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
