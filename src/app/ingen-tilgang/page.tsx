import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserRole, homeForRole, roleLabel } from "@/lib/auth";
import { LogoutButton } from "@/components/admin/LogoutButton";

export const metadata = { title: "Ingen tilgang | Downtown Barbers" };
export const dynamic = "force-dynamic";

/**
 * Vises når en INNLOGGET bruker prøver å åpne en side rollen ikke har
 * tilgang til (f.eks. kasse → /admin). Før havnet man på innloggingsskjemaet
 * selv om man fortsatt var logget inn – forvirrende. Nå: hvem du er, hva som
 * manglet, og en knapp tilbake til din egen side (eller logg ut for å bytte).
 */
export default async function IngenTilgang() {
  const me = await getUserRole();
  if (!me) redirect("/?login=1");
  const home = homeForRole(me.role);
  const homeLabel: Record<string, string> = {
    "/admin": "Til admin",
    "/kasse": "Til kassa",
    "/ansatt": "Til min side",
    "/revisor": "Til revisor",
    "/": "Til forsiden",
  };

  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-canvas px-5 py-16 text-fg">
      <div className="w-full max-w-md border border-line bg-surface p-8 text-center">
        <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
          Downtown Barbers
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold">Ingen tilgang til denne siden</h1>
        <p className="mt-3 text-sm text-muted">
          Du er logget inn som <span className="font-medium text-fg">{me.email ?? "ukjent"}</span>{" "}
          med rollen <span className="font-medium text-fg">{roleLabel(me.role)}</span>. Siden du
          prøvde å åpne krever en annen rolle.
        </p>
        <p className="mt-2 text-xs text-muted">
          Trenger du tilgang? Be admin endre rollen din under Brukere &amp; roller.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={home}
            className="bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            {homeLabel[home] ?? "Tilbake"}
          </Link>
          <LogoutButton />
        </div>
      </div>
    </main>
  );
}
