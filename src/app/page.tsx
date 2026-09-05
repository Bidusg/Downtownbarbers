import type { CSSProperties } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Reveal } from "@/components/site/Reveal";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { HeroCarousel, type Slide } from "@/components/site/HeroCarousel";
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

const rise = (ms: number) => ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

const marqueeWords = [
  "Presisjon",
  "Fade",
  "Skjegg",
  "Hot towel",
  "Stil",
  "Oslo",
  "Håndverk",
];

// Hero-karusell: veksler mellom klipp og bilder (video først for effekt).
const heroSlides: Slide[] = [
  { type: "video", src: "/media/hero/clip1.mp4" },
  { type: "image", src: "/img/hero/h1.jpg" },
  { type: "image", src: "/img/hero/h2.jpg" },
  { type: "video", src: "/media/hero/clip2.mp4" },
  { type: "image", src: "/img/hero/h3.jpg" },
  { type: "image", src: "/img/hero/h4.jpg" },
  { type: "video", src: "/media/hero/clip3.mp4" },
  { type: "image", src: "/img/hero/h5.jpg" },
  { type: "image", src: "/img/hero/h6.jpg" },
  { type: "video", src: "/media/hero/clip4.mp4" },
  { type: "image", src: "/img/hero/h7.jpg" },
  { type: "image", src: "/img/hero/h8.jpg" },
  { type: "video", src: "/media/hero/clip5.mp4" },
  { type: "image", src: "/img/hero/h9.jpg" },
  { type: "image", src: "/img/hero/h10.jpg" },
  { type: "video", src: "/media/hero/clip6.mp4" },
  { type: "image", src: "/img/hero/h11.jpg" },
  { type: "image", src: "/img/hero/h12.jpg" },
  { type: "image", src: "/img/hero/h13.jpg" },
  { type: "image", src: "/img/hero/h14.jpg" },
];

const gallery = [
  { src: "/img/curly-fade.jpg", alt: "Curly top med skarp drop fade" },
  { src: "/img/razor-detail.jpg", alt: "Barbering med barberkniv og pensel" },
  { src: "/img/clipper-neck.jpg", alt: "Ren nakkelinje med trimmer" },
  { src: "/img/shelf-detail.jpg", alt: "Detaljer og produkter i shopen" },
];

const craft = [
  {
    img: "/img/portrait-fade.jpg",
    title: "Presist kutt",
    text: "Definerte linjer og en myk, ren overgang.",
  },
  {
    img: "/img/hot-towel.jpg",
    title: "Det varme håndkleet",
    text: "Ritualet som gjør barberingen til en pause.",
  },
  {
    img: "/img/powder.jpg",
    title: "Finishen",
    text: "Tekstur og hold som sitter hele dagen.",
  },
];

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
      <ScrollProgress />
      <Header overlay />

      {/* ===================== HERO ===================== */}
      <section className="relative flex min-h-[92vh] items-end overflow-hidden">
        <HeroCarousel slides={heroSlides} poster="/media/hero/poster.jpg" />
        {/* Overlays for lesbarhet */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/60" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-transparent to-transparent" />

        <div className="relative mx-auto w-full max-w-6xl px-5 pt-40 pb-20 sm:pb-28">
          <p
            className="rise text-[11px] font-semibold tracking-[0.35em] text-accent-soft uppercase"
            style={rise(100)}
          >
            Oslo · Siden {s.established}
          </p>
          <h1 className="mt-5 font-display text-6xl leading-[0.88] font-bold tracking-tight text-white sm:text-8xl">
            <span className="rise block" style={rise(220)}>
              Downtown
            </span>
            <span
              className="rise block text-accent-soft italic"
              style={rise(360)}
            >
              Barbers
            </span>
          </h1>
          <p
            className="rise mt-6 max-w-xl font-display text-xl text-white/90 sm:text-2xl"
            style={rise(520)}
          >
            {s.hero_title} {s.hero_italic}
          </p>
          <p className="rise mt-4 max-w-lg text-white/60" style={rise(640)}>
            {s.intro}
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center gap-4"
            style={rise(760)}
          >
            <a
              href="/booking"
              className="shine-btn bg-accent-soft px-8 py-3.5 text-base font-semibold text-[#211E1A] transition-transform hover:-translate-y-0.5"
            >
              Bestill time
            </a>
            <a
              href="#handverket"
              className="border border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
            >
              Se håndverket
            </a>
            {s.show_rating && (
              <span className="text-sm text-white/70">
                ★ {s.rating_value.toString().replace(".", ",")} ({s.rating_count}{" "}
                vurderinger)
              </span>
            )}
          </div>
        </div>

        {/* Scroll-hint */}
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <div className="bob flex flex-col items-center gap-1.5 text-white/60">
            <span className="text-[9px] tracking-[0.3em] uppercase">Scroll</span>
            <span aria-hidden>↓</span>
          </div>
        </div>
      </section>

      {/* ===================== MARQUEE ===================== */}
      <div className="marquee overflow-hidden border-y border-line bg-accent py-4 text-accent-fg">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex items-center" aria-hidden={dup === 1}>
              {marqueeWords.map((w) => (
                <span key={w} className="flex items-center">
                  <span className="px-6 font-display text-lg tracking-wide">
                    {w}
                  </span>
                  <span className="text-accent-soft">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ===================== OM OSS ===================== */}
      <section className="border-b border-line bg-surface-2">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:py-28">
          <Reveal variant="left">
            <Label>Om oss</Label>
            <p className="mt-6 font-display text-2xl leading-snug sm:text-3xl">
              {s.about_text}
            </p>
            <a
              href="/booking"
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-accent-soft transition-colors hover:text-fg"
            >
              Bestill din time
              <span aria-hidden>→</span>
            </a>
          </Reveal>
          <Reveal variant="right" delay={120}>
            <div className="img-zoom relative aspect-[4/3] overflow-hidden">
              <img
                src="/img/neckline.jpg"
                alt="Barber som renser nakkelinjen hos Downtown Barbers"
                loading="lazy"
                className="h-full w-full object-cover"
              />
              <span className="absolute bottom-4 left-4 text-[10px] font-semibold tracking-[0.3em] text-white/90 uppercase drop-shadow">
                Downtown Barbers · Oslo
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===================== HÅNDVERKET ===================== */}
      <section id="handverket" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <Label>Håndverket</Label>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold sm:text-5xl">
              Detaljene du kjenner igjen når du reiser deg fra stolen.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {craft.map((c, i) => (
              <Reveal key={c.title} delay={i * 120} variant="up">
                <figure className="group">
                  <div className="img-zoom relative aspect-[3/4] overflow-hidden">
                    <img
                      src={c.img}
                      alt={c.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-70" />
                    <figcaption className="absolute right-5 bottom-5 left-5">
                      <p className="font-display text-xl font-bold text-white">
                        {c.title}
                      </p>
                      <p className="mt-1 text-sm text-white/75">{c.text}</p>
                    </figcaption>
                  </div>
                </figure>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== GALLERI ===================== */}
      <section id="galleri" className="border-b border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <Label>Galleri</Label>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Fra stolen
            </h2>
          </Reveal>
          <div className="mt-12 gap-5 columns-1 sm:columns-2">
            {gallery.map((g, i) => (
              <Reveal
                key={g.src}
                delay={(i % 2) * 90}
                className="mb-5 block break-inside-avoid"
              >
                <div className="img-zoom overflow-hidden">
                  <img
                    src={g.src}
                    alt={g.alt}
                    loading="lazy"
                    className="w-full object-cover"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== NEON-BANNER (parallax) ===================== */}
      <section className="relative flex min-h-[70vh] items-center justify-center overflow-hidden border-b border-line">
        <img
          src="/img/neon-sign.jpg"
          alt="Downtown Barbers neonskilt"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        <div className="absolute inset-0 bg-black/65" />
        <Reveal variant="scale" className="relative px-5 text-center">
          <p className="text-[11px] font-semibold tracking-[0.35em] text-accent-soft uppercase">
            Downtown Barbers · Oslo
          </p>
          <p className="mx-auto mt-5 max-w-3xl font-display text-3xl leading-tight font-bold text-white sm:text-5xl">
            Der presisjon møter stil.
          </p>
        </Reveal>
      </section>

      {/* ===================== TJENESTER ===================== */}
      <section id="tjenester" className="border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <Label>Tjenester</Label>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Prisliste
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {serviceCategories.map((cat, ci) => (
              <Reveal key={cat.name} delay={ci * 100}>
                <div className="h-full border border-line bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-accent-soft">
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
                          <span className="font-display text-sm whitespace-nowrap text-accent-soft">
                            {sv.price}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-muted">
                          {sv.description}
                        </p>
                        <p className="mt-1 text-xs text-muted">{sv.duration}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="border-b border-line bg-accent text-accent-fg">
        <div className="mx-auto max-w-6xl px-5 py-24 text-center md:py-32">
          <Reveal>
            <h2 className="mx-auto max-w-2xl font-display text-4xl leading-tight font-bold sm:text-6xl">
              {s.cta_title}
            </h2>
            <p className="mx-auto mt-5 max-w-md text-base opacity-80">
              {s.cta_text}
            </p>
            <a
              href="/booking"
              className="shine-btn mt-10 inline-block bg-accent-soft px-9 py-4 text-sm font-semibold tracking-wide text-[#211E1A] uppercase transition-transform hover:-translate-y-0.5"
            >
              Bestill time nå
            </a>
          </Reveal>
        </div>
      </section>

      {/* ===================== TEAM ===================== */}
      <section id="team" className="border-b border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <Reveal>
            <Label>Teamet</Label>
            <h2 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
              Håndverkerne
            </h2>
          </Reveal>
          <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-6">
            {team.map((m, i) => (
              <Reveal key={m.name} delay={i * 70} variant="scale">
                <div className="group text-center">
                  <div className="mx-auto flex aspect-square w-full items-center justify-center rounded-full bg-surface font-display text-3xl font-bold text-fg ring-1 ring-line transition-all duration-300 group-hover:text-accent-soft group-hover:ring-accent-soft">
                    {m.name.charAt(0)}
                  </div>
                  <p className="mt-3 font-medium text-fg">{m.name}</p>
                  <p className="text-xs text-muted">{m.title}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ÅPNINGSTIDER + KONTAKT ===================== */}
      <section id="apningstider" className="border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-14 px-5 py-20 md:grid-cols-2 md:py-28">
          <Reveal>
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
          </Reveal>
          <Reveal delay={120} id="kontakt">
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
          </Reveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
