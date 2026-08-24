import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-canvas px-6 text-center text-fg">
      <p className="font-display text-6xl font-bold text-accent-soft">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold">
        Siden finnes ikke
      </h1>
      <p className="mt-2 max-w-md text-muted">
        Vi fant ikke siden du lette etter. Den kan ha blitt flyttet, eller så
        skrev du kanskje feil adresse.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Til forsiden
        </Link>
        <Link
          href="/booking"
          className="border border-line-2 px-6 py-3 text-sm font-semibold text-fg transition-colors hover:border-accent-soft"
        >
          Bestill time
        </Link>
      </div>
    </div>
  );
}
