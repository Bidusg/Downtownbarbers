import { requireRole } from "@/lib/auth";
import { getClockBoard } from "@/app/kasse/stempling/actions";
import { StemplingKiosk } from "@/components/kasse/StemplingKiosk";

export const dynamic = "force-dynamic";

export default async function StemplingPage() {
  await requireRole(["shop", "admin"]);
  const staff = await getClockBoard();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 font-display text-xl font-bold">Stempling</h1>
      <p className="mb-6 text-sm text-muted">
        Trykk på ditt navn og skriv inn PIN for å registrere vakt, pause eller
        avslutning. Ingenting registreres uten PIN.
      </p>
      <StemplingKiosk staff={staff} />
    </main>
  );
}
