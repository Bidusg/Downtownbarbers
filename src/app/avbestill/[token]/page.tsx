import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { T, TDyn } from "@/lib/i18n/T";
import { PortalDate } from "@/components/portal/PortalDate";
import { PublicPage } from "@/components/site/PublicPage";
import { CancelSubmit } from "./CancelSubmit";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const dynamic = "force-dynamic";
export const viewport = PUBLIC_VIEWPORT;
export const metadata = { title: "Avbestill time | Downtown Barbers", robots: { index: false } };

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
    <PublicPage narrow>
      <div className="rounded-[28px] bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_60px_-30px_rgba(0,0,0,0.25)] sm:p-12">
        {children}
      </div>
    </PublicPage>
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
        <h1 className="m-title text-3xl sm:text-4xl"><T k={`cancelpage.${key}.h`} /></h1>
        <p className="mt-4 text-muted"><T k={bodyKey} /></p>
        <Link href="/" className="pill pill-soft mt-8">
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
        <h1 className="m-title text-3xl sm:text-4xl"><T k="cancelpage.not_found.h" /></h1>
        <p className="mt-4 text-muted"><T k="portal.linkInvalid" /></p>
        <Link href="/" className="pill pill-soft mt-8"><T k="common.toFront" /></Link>
      </Card>
    );
  }

  if (b.status === "cancelled") {
    return (
      <Card>
        <h1 className="m-title text-3xl sm:text-4xl"><T k="cancelpage.already.h" /></h1>
        <p className="mt-4 text-muted"><T k="cancelpage.already.p" /></p>
        <Link href="/booking" className="pill pill-soft mt-8"><T k="common.bookNew" /></Link>
      </Card>
    );
  }

  const past = new Date(b.start_at).getTime() <= Date.now();

  return (
    <Card>
      <p className="m-eyebrow">Downtown Barbers</p>
      <h1 className="m-title mt-2 text-3xl sm:text-4xl"><T k="cancelpage.title" /></h1>
      <div className="mx-auto mt-8 max-w-sm divide-y divide-line rounded-2xl bg-canvas px-5 text-left text-[15px]">
        <div className="flex justify-between gap-4 py-3.5">
          <span className="text-muted"><T k="cancelpage.service" /></span>
          <span className="font-medium text-fg">{b.service_name ? <TDyn text={b.service_name} map="services" /> : "—"}</span>
        </div>
        <div className="flex justify-between gap-4 py-3.5">
          <span className="text-muted"><T k="cancelpage.barber" /></span>
          <span className="font-medium text-fg">{b.barber_name ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-4 py-3.5">
          <span className="text-muted"><T k="cancelpage.time" /></span>
          <span className="text-right font-medium capitalize text-fg"><PortalDate iso={b.start_at} withTime /></span>
        </div>
      </div>

      {past ? (
        <p className="mt-8 text-muted">
          <T k="cancelpage.pastNote" />
        </p>
      ) : (
        <form action={cancelAction} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <CancelSubmit />
          <Link href="/" className="pill pill-soft mt-3 w-full">
            <T k="cancelpage.no" />
          </Link>
        </form>
      )}
    </Card>
  );
}
