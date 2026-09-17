import { createClient } from "@/lib/supabase/server";
import { ResetForm } from "./ResetForm";

export default async function Tilbakestill({
  searchParams,
}: {
  searchParams: Promise<{ feil?: string }>;
}) {
  const sp = await searchParams;
  const invalid = sp.feil === "ugyldig";

  // Recovery-sesjonen settes av /tilbakestill/bekreft (verifyOtp).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const canReset = !invalid && !!user;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5 text-fg">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-bold">Downtown Barbers</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Nytt passord
          </p>
        </div>

        {canReset ? (
          <ResetForm />
        ) : (
          <div className="border border-danger/40 bg-danger/10 p-6 text-center">
            <p className="text-sm text-danger">
              Lenken er utløpt eller ugyldig.
            </p>
            <p className="mt-3 text-xs text-muted">
              Be om en ny lenke for å tilbakestille passordet.
            </p>
            <a
              href="/glemt-passord"
              className="mt-5 inline-block text-xs text-accent-soft hover:underline"
            >
              Be om ny lenke
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
