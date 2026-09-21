import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function unsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const sb = await createClient();
  const { data } = await sb.rpc("marketing_unsubscribe", { p_token: token });
  redirect(`/avmeld/${token}?done=${data ? "1" : "nf"}`);
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg items-center px-5 py-16">
      <div className="w-full border border-line bg-surface p-8 text-center">{children}</div>
    </main>
  );
}

export default async function AvmeldPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const valid = /^[0-9a-f-]{36}$/i.test(token);

  if (done) {
    return (
      <Card>
        <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">Downtown Barbers</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-fg">Du er meldt av ✓</h1>
        <p className="mt-3 text-sm text-muted">
          Du vil ikke lenger få markedsføring fra oss. Du får fortsatt viktige e-poster om timene dine.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-accent-soft hover:underline">Til forsiden</Link>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-[11px] font-semibold tracking-[0.3em] text-accent-soft uppercase">Downtown Barbers</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-fg">Meld deg av markedsføring?</h1>
      <p className="mt-3 text-sm text-muted">
        Du vil da ikke få tilbud og nyheter fra oss på e-post. Bekreftelser og påminnelser om timene dine berøres ikke.
      </p>
      {valid ? (
        <form action={unsubscribe} className="mt-8">
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            className="w-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Ja, meld meg av
          </button>
          <Link href="/" className="mt-4 inline-block text-sm text-muted hover:text-fg">Nei, behold</Link>
        </form>
      ) : (
        <p className="mt-6 text-sm text-muted">Lenken ser ut til å være ugyldig.</p>
      )}
    </Card>
  );
}
