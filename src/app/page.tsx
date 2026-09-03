import type { CSSProperties } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import {
  getPublicServices,
  getPublicBarbers,
  groupByCategory,
} from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
      {children}
    </p>
  );
}

export default async function Home() {
  const [services, team, s] = await Promise.all([
    getPublicServices(),
    getPublicBarbers(),
    getSiteSettings(),
  ]);
  const serviceCategories = groupByCategory(services);
  const accentStyle = {
    ["--color-accent-soft"]: s.accent_hex,
  } as CSSProperties;

  return (
    <div id="top" className="bg-canvas text-fg" style={accentStyle}>
      <Header />

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
        <Label>Oslo · Siden {s.established}</Label>
        <h1 className="mt-6 max-w-3xl font-display text-5xl leading-[0.95] font-bold tracking-tight sm:text-7xl">
          {s.hero_title}{" "}
          <span className="italic text-accent-soft">{s.hero_italic}</span>
        </h1>
        <p className="mt-7 max-w-xl text-lg text-muted">{s.intro}</p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <a
            href="/booking"
            className="bg-accent px-8 py-3.5 text-base font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Bestill time
          </a>
          <a
            href="#tjenester"
            className="border border-line-2 px-8 py-3.5 text-base font-semibold text-fg transition-colors hover:border-fg"
          >
            Se tjenester
          </a>
          {s.show_rating && (
            <span className="text-sm text-muted">
              ★ {s.rating_value.toString().replace(".", ",")} ({s.rating_count}{" "}
              vurderinger)
            </span>
          )}
        </div>
      </section>

      {/* OM OSS */}
      <section className="border-t border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Label>Om oss</Label>
          <p className="mt-6 max-w-3xl font-display text-2xl leading-snug sm:text-3xl">
            {s.about_text}
          </p>
        </div>
      </section>

      {/* TJENESTER */}
      <section id="tjenester" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Label>Tjenester</Label>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            Prisliste
          </h2>
          <div className="mt-12 grid gap-12 md:grid-cols-3">
            {serviceCategories.map((cat) => (
              <div key={cat.name}>
                <h3 className="mb-5 text-sm font-semibold tracking-wide text-fg uppercase">
                  {cat.name}
                </h3>
                <ul className="space-y-5">
                  {cat.services.map((sv) => (
                    <li
                      key={sv.name}
                      className="border-b border-line pb-5 last:border-0"
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-medium text-fg">{sv.name}</span>
                        <span className="font-display text-sm whitespace-nowrap text-fg">
                          {sv.price}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted">{sv.description}</p>
                      <p className="mt-1 text-xs text-muted">{sv.duration}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATEMENT / BOOKING CTA */}
      <section className="border-t border-line bg-accent text-accent-fg">
        <div className="mx-auto max-w-6xl px-5 py-24 text-center">
          <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight font-bold sm:text-5xl">
            {s.cta_title}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base opacity-80">{s.cta_text}</p>
          <a
            href="/booking"
            className="mt-10 inline-block border border-accent-fg/40 px-8 py-3.5 text-sm font-semibold tracking-wide uppercase transition-colors hover:bg-accent-fg hover:text-accent"
          >
            Bestill time nå
          </a>
        </div>
      </section>

      {/* TEAM */}
      <section id="team" className="border-t border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Label>Teamet</Label>
          <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
            Håndverkerne
          </h2>
          <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-6">
            {team.map((m) => (
              <div key={m.name} className="text-center">
                <div className="mx-auto flex aspect-square w-full items-center justify-center bg-surface font-display text-3xl font-bold text-fg">
                  {m.name.charAt(0)}
                </div>
                <p className="mt-3 font-medium text-fg">{m.name}</p>
                <p className="text-xs text-muted">{m.title}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ÅPNINGSTIDER + KONTAKT */}
      <section id="apningstider" className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:grid-cols-2">
          <div>
            <Label>Åpningstider</Label>
            <ul className="mt-8 space-y-3.5">
              {s.opening_hours.map((o) => (
                <li
                  key={o.day}
                  className="flex justify-between border-b border-line pb-3.5 text-sm"
                >
                  <span className="text-fg">{o.day}</span>
                  <span className="text-muted">{o.hours}</span>
                </li>
              ))}
            </ul>
          </div>
          <div id="kontakt">
            <Label>Kontakt</Label>
            <div className="mt-8 space-y-3 text-fg">
              <p>{s.address}</p>
              <p>
                <a href={`tel:${s.phone}`} className="hover:text-accent-soft">
                  {s.phone}
                </a>
              </p>
              {s.email && (
                <p>
                  <a href={`mailto:${s.email}`} className="hover:text-accent-soft">
                    {s.email}
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
