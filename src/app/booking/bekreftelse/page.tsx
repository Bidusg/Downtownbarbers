import Link from "next/link";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

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
            <p className="font-display text-3xl font-bold">Betalingen ble avbrutt</p>
            <p className="mt-4 text-muted">
              Timen din er fortsatt reservert – du kan betale i salongen.
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-4xl font-bold">
              {paid ? "Betalt og bekreftet! 💈" : "Timen er bekreftet! 💈"}
            </p>
            <p className="mt-4 text-muted">
              {paid
                ? "Depositumet er registrert. Vi gleder oss til å se deg."
                : "Vi sender en bekreftelse på e-post. Vi gleder oss til å se deg."}
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-10 border border-line-2 px-6 py-3 text-sm font-semibold text-fg hover:border-fg"
        >
          Til forsiden
        </Link>
      </section>
      <Footer />
    </div>
  );
}
