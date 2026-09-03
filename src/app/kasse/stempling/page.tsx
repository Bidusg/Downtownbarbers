import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getClockBoard } from "@/app/kasse/stempling/actions";
import { StemplingKiosk } from "@/components/kasse/StemplingKiosk";

export const dynamic = "force-dynamic";

export default async function StemplingPage() {
  await requireRole(["shop", "admin"]);
  const staff = await getClockBoard();

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="flex items-center justify-between border-b border-line bg-surface px-6 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
            Downtown Barbers
          </p>
          <p className="font-display text-lg font-bold">Stempling</p>
        </div>
        <Link
          href="/kasse"
          className="text-sm text-muted transition-colors hover:text-fg"
        >
          Til kassen →
        </Link>
      </header>

      <main className="mx-auto max-w-4xl p-6">
        <p className="mb-6 text-sm text-muted">
          Trykk på ditt navn og skriv inn PIN for å registrere vakt, pause eller
          avslutning. Ingenting registreres uten PIN.
        </p>
        <StemplingKiosk staff={staff} />
      </main>
    </div>
  );
}
