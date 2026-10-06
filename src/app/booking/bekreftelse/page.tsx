import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Button } from "@/components/ui/Button";
import { T } from "@/lib/i18n/T";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

export const metadata = { title: "Bekreftelse | Downtown Barbers" };

export default async function Bekreftelse({
  searchParams,
}: {
  searchParams: Promise<{ betalt?: string; feil?: string }>;
}) {
  const sp = await searchParams;
  const paid = sp.betalt === "1";
  const failed = sp.feil === "1";

  return (
    <div className="bg-canvas text-fg">
      <Header />
      <section className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-5 py-20 text-center">
        {failed ? (
          <>
            <p className="font-display text-3xl font-bold"><T k="confirm.failedTitle" /></p>
            <p className="mt-4 text-muted">
              <T k="confirm.failedBody" />
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-bold">
              {paid ? <T k="confirm.paidTitle" /> : <T k="confirm.title" />}
            </p>
            <p className="mt-4 text-muted">
              {paid ? <T k="confirm.paidBody" /> : <T k="confirm.body" />}
            </p>
          </>
        )}
        <Button variant="subtle" href="/" className="mt-10 px-6 py-3 text-sm">
          <T k="common.toFront" />
        </Button>
      </section>
      <Footer />
    </div>
  );
}
