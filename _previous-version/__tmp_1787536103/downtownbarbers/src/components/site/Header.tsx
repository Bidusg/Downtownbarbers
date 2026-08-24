import { salon } from "@/lib/data/salon";

const nav = [
  { label: "Tjenester", href: "#tjenester" },
  { label: "Team", href: "#team" },
  { label: "Åpningstider", href: "#apningstider" },
  { label: "Kontakt", href: "#kontakt" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <a href="#top" className="flex flex-col leading-none">
          <span className="font-display text-xl font-bold tracking-tight text-fg">
            {salon.name}
          </span>
          <span className="mt-1 text-[9px] font-semibold tracking-[0.35em] text-accent-soft uppercase">
            {salon.slogan}
          </span>
        </a>

        <nav className="hidden items-center gap-9 md:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="text-[13px] font-medium text-muted transition-colors hover:text-fg"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <a
          href="/booking"
          className="bg-accent px-5 py-2.5 text-[13px] font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
        >
          Bestill time
        </a>
      </div>
    </header>
  );
}
