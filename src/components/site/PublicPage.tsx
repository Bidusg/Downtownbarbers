import type { ReactNode } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";

/**
 * Felles ramme for kundesidene utenfor forsiden (Min side, avbestilling,
 * avmelding): samme lyse stil, meny og bunn som resten av nettsiden.
 */
export function PublicPage({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="cine min-h-screen bg-canvas text-fg">
      <Header />
      <main
        id="main"
        className={
          "mx-auto px-5 pt-10 pb-24 sm:pt-16 " + (narrow ? "max-w-lg" : "max-w-3xl")
        }
      >
        {children}
      </main>
      <Footer />
    </div>
  );
}

/** Enkel melding-flis (lenke ugyldig, avbestilt, avmeldt …). */
export function MessageTile({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[28px] bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_20px_60px_-30px_rgba(0,0,0,0.25)] sm:p-12">
      <h1 className="m-title text-3xl sm:text-4xl">{title}</h1>
      {children && <div className="mt-4 text-muted">{children}</div>}
      {action && <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">{action}</div>}
    </div>
  );
}
