import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCustomerMembershipByToken } from "@/lib/membership-queries";
import { T } from "@/lib/i18n/T";
import { PublicPage, MessageTile } from "@/components/site/PublicPage";
import { PortalView, type Portal } from "@/components/portal/PortalView";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const dynamic = "force-dynamic";
export const viewport = PUBLIC_VIEWPORT;
export const metadata = { title: "Min side | Downtown Barbers", robots: { index: false } };

function NotFound() {
  return (
    <PublicPage narrow>
      <MessageTile
        title={<T k="portal.notFoundTitle" />}
        action={
          <Link href="/" className="pill pill-soft">
            <T k="common.toFront" />
          </Link>
        }
      >
        <T k="portal.linkInvalid" />
      </MessageTile>
    </PublicPage>
  );
}

export default async function MinSide({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return <NotFound />;

  const sb = await createClient();
  const { data } = await sb.rpc("customer_portal", { p_token: token });
  const p = (Array.isArray(data) ? data[0] : data) as Portal | null;
  if (!p || !p.full_name) return <NotFound />;

  // Tillegg per booking (handlekurv) – egen SECURITY DEFINER-RPC via token.
  const { data: addonRows } = await sb.rpc("customer_portal_addons", { p_token: token });
  const addonsByBooking = new Map<string, string[]>();
  for (const r of (addonRows ?? []) as { booking_id: string; name: string }[]) {
    const list = addonsByBooking.get(r.booking_id) ?? [];
    list.push(r.name);
    addonsByBooking.set(r.booking_id, list);
  }

  const membership = await getCustomerMembershipByToken(token);
  return <PortalView token={token} p={p} addonsByBooking={addonsByBooking} membership={membership} />;
}

