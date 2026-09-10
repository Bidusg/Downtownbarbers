import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type BookingRow = {
  service_name: string | null;
  barber_name: string | null;
  start_at: string | null;
  status: string | null;
  customer_name: string | null;
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function cancelAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const sb = await createClient();
  const { data: status } = await sb.rpc("cancel_booking_by_token", {
    p_token: token,
  });
  redirect(`/avbestill/${token}?status=${status ?? "not_found"}`);
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-5 py-16">
      <div className="w-full border border-line bg-surface p-8 text-center">
        {children}
      </div>
    </main>
  );
}

export default async function AvbestillPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { token } = await params;
  const { status } = await searchParams;

  // Resultat etter avbestilling
  if (status) {
    const msg: Record<string, { h: string; p: string }> = {
      ok: { h: "Timen er avbestilt ✓", p: "Takk for at du ga oss beskjed. Velkommen tilbake en annen gang!" },
      already: { h: "Allerede avbestilt", p: "Denne timen er allerede avbestilt." },
      too_late: { h: "For sent å avbestille", p: "Timen har allerede vært, eller er i gang. Ta kontakt med oss om noe er feil." },
      not_found: { h: "Fant ikke timen", p: "Lenken ser ut til å være ugyldig eller utløpt." },
    };
    const m = msg[status] ?? msg.not_found;
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg">{m.h}</h1>
        <p className="mt-3 text-sm text-muted">{m.p}</p>
        <a href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline">
          Til forsiden
        </a>
      </Card>
    );
  }

  const sb = await createClient();
  const { data } = await sb.rpc("get_booking_by_token", { p_token: token });
  const b = (Array.isArray(data) ? data[0] : data) as BookingRow | undefined;

  if (!b || !b.start_at) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg">Fant ikke timen</h1>
        <p className="mt-3 text-sm text-muted">Lenken ser ut til å være ugyldig eller utløpt.</p>
        <a href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline">Til forsiden</a>
      </Card>
    );
  }

  if (b.status === "cancelled") {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg">Allerede avbestilt</h1>
        <p className="mt-3 text-sm text-muted">Denne timen er allerede avbestilt.</p>
        <a href="/booking" className="mt-6 inline-block text-sm text-accent-soft hover:underline">Bestill ny time</a>
      </Card>
    );
  }

  const past = new Date(b.start_at).getTime() <= Date.now();

  return (
    <Card>
      <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
        Downtown Barbers
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold text-fg">Avbestille time?</h1>
      <div className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm">
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted">Tjeneste</span>
          <span className="font-medium text-fg">{b.service_name ?? "—"}</span>
        </div>
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted">Barber</span>
          <span className="font-medium text-fg">{b.barber_name ?? "—"}</span>
        </div>
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted">Tid</span>
          <span className="font-medium capitalize text-fg">{fmt(b.start_at)}</span>
        </div>
      </div>

      {past ? (
        <p className="mt-6 text-sm text-muted">
          Denne timen kan ikke avbestilles på nett lenger. Ta kontakt med oss på
          +47 463 58 764.
        </p>
      ) : (
        <form action={cancelAction} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full bg-danger px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Ja, avbestill timen
          </button>
          <a href="/" className="mt-4 inline-block text-sm text-muted hover:text-fg">
            Nei, behold timen
          </a>
        </form>
      )}
    </Card>
  );
}
