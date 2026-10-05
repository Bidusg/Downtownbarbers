import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { T, TDyn } from "@/lib/i18n/T";
import { PortalDate } from "@/components/portal/PortalDate";

export const dynamic = "force-dynamic";

type BookingRow = {
  service_name: string | null;
  barber_name: string | null;
  start_at: string | null;
  status: string | null;
  customer_name: string | null;
};

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
    const known = ["ok", "already", "too_late", "not_found"];
    const key = known.includes(status) ? status : "not_found";
    const bodyKey = key === "not_found" ? "portal.linkInvalid" : `cancelpage.${key}.p`;
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg"><T k={`cancelpage.${key}.h`} /></h1>
        <p className="mt-3 text-sm text-muted"><T k={bodyKey} /></p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline">
          <T k="common.toFront" />
        </Link>
      </Card>
    );
  }

  const sb = await createClient();
  const { data } = await sb.rpc("get_booking_by_token", { p_token: token });
  const b = (Array.isArray(data) ? data[0] : data) as BookingRow | undefined;

  if (!b || !b.start_at) {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg"><T k="cancelpage.not_found.h" /></h1>
        <p className="mt-3 text-sm text-muted"><T k="portal.linkInvalid" /></p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline"><T k="common.toFront" /></Link>
      </Card>
    );
  }

  if (b.status === "cancelled") {
    return (
      <Card>
        <h1 className="font-display text-2xl font-bold text-fg"><T k="cancelpage.already.h" /></h1>
        <p className="mt-3 text-sm text-muted"><T k="cancelpage.already.p" /></p>
        <Link href="/booking" className="mt-6 inline-block text-sm text-accent-soft hover:underline"><T k="common.bookNew" /></Link>
      </Card>
    );
  }

  const past = new Date(b.start_at).getTime() <= Date.now();

  return (
    <Card>
      <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
        Downtown Barbers
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold text-fg"><T k="cancelpage.title" /></h1>
      <div className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm">
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted"><T k="cancelpage.service" /></span>
          <span className="font-medium text-fg">{b.service_name ? <TDyn text={b.service_name} map="services" /> : "—"}</span>
        </div>
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted"><T k="cancelpage.barber" /></span>
          <span className="font-medium text-fg">{b.barber_name ?? "—"}</span>
        </div>
        <div className="flex justify-between border-b border-line pb-2">
          <span className="text-muted"><T k="cancelpage.time" /></span>
          <span className="font-medium capitalize text-fg"><PortalDate iso={b.start_at} withTime /></span>
        </div>
      </div>

      {past ? (
        <p className="mt-6 text-sm text-muted">
          <T k="cancelpage.pastNote" />
        </p>
      ) : (
        <form action={cancelAction} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full bg-danger px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            <T k="cancelpage.yes" />
          </button>
          <Link href="/" className="mt-4 inline-block text-sm text-muted hover:text-fg">
            <T k="cancelpage.no" />
          </Link>
        </form>
      )}
    </Card>
  );
}
