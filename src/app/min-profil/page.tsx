import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserRole, homeForRole, roleLabel } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ProfileCard, EmailCard, PasswordCard } from "./ProfilForms";

export const metadata = { title: "Min profil | Downtown Barbers" };
export const dynamic = "force-dynamic";

/** Henter brukerens egne profilfelt. Degraderer trygt om telefon mangler. */
async function getMyProfile(userId: string): Promise<{
  fullName: string;
  phone: string;
}> {
  try {
    const sb = await createClient();
    const first = await sb
      .from("profiles")
      .select("full_name, phone")
      .eq("id", userId)
      .single();

    let data = first.data;
    if (first.error && /phone/i.test(first.error.message)) {
      const fallback = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .single();
      data = fallback.data as typeof data;
    }

    return {
      fullName: (data?.full_name as string) ?? "",
      phone: ((data as { phone?: string } | null)?.phone as string) ?? "",
    };
  } catch {
    return { fullName: "", phone: "" };
  }
}

/**
 * «Min profil» – selvbetjening for ALLE innloggede roller (admin/eier/shop/
 * revisor/staff/kunde). Krever kun at bruker finnes (ingen rolle-vakt), og
 * lar brukeren se/endre egne grunnopplysninger, e-post og passord. All
 * skriving skjer server-side mot KUN egen rad (auth.uid), aldri en id fra
 * klienten.
 */
export default async function MinProfil() {
  const me = await getUserRole();
  if (!me) redirect("/?login=1");

  const profile = await getMyProfile(me.userId);
  const home = homeForRole(me.role);

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-canvas px-5 py-10 text-fg">
      <div className="mb-6">
        <Link
          href={home}
          className="text-xs font-semibold tracking-wide text-muted uppercase hover:text-fg"
        >
          ← Tilbake
        </Link>
      </div>

      <PageHeader
        title="Min profil"
        description="Se og endre dine egne opplysninger, e-post og passord."
      />

      <div className="space-y-5">
        <Card title="Konto">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                E-post
              </dt>
              <dd className="mt-1 text-sm text-fg">{me.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted uppercase">
                Rolle
              </dt>
              <dd className="mt-1 text-sm text-fg">{roleLabel(me.role)}</dd>
            </div>
          </dl>
        </Card>

        <ProfileCard fullName={profile.fullName} phone={profile.phone} />
        <EmailCard currentEmail={me.email ?? ""} />
        <PasswordCard />
      </div>
    </main>
  );
}
