import type { CSSProperties } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { HeroCarousel, type Slide } from "@/components/site/HeroCarousel";
import { GoogleReviews } from "@/components/site/GoogleReviews";
import {
  SmoothScroll,
  Parallax,
  SplitReveal,
  FadeUp,
  Hairline,
  ScaleIn,
} from "@/components/site/motion/CineFx";
import {
  getPublicServices,
  getPublicBarbers,
  groupByCategory,
} from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteImages, getSiteCraft } from "@/lib/site-images";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getPublicReviewsSummary } from "@/lib/reviews";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-[0.34em] text-accent-soft uppercase">
      {children}
    </p>
  );
}

const rise = (ms: number) => ({ ["--rise-delay"]: `${ms}ms` }) as CSSProperties;

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
    title: "Faden",
    text: "Hud til topp i én ren overgang. Ingen kanter som skurrer.",
  },
  {
    img: "/img/hot-towel.jpg",
    title: "Det varme håndkleet",
    text: "Fem minutter der ingenting haster. Så barberkniven.",
  },
  {
    img: "/img/powder.jpg",
    title: "Finishen",
    text: "Tekstur og hold som sitter – fra stolen til siste øl.",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  // Forhåndsvisning (?preview=1) tar med skjulte bilder – kun for admin.
  const sp = await searchParams;
  const wantPreview = sp?.preview === "1";
  const role = wantPreview ? await getUserRole() : null;
  const preview = wantPreview && isAdminRole(role?.role);

  const [services, team, s, omdomme, siteImages, siteCraft] = await Promise.all([
    getPublicServices(),
    getPublicBarbers(),
    getSiteSettings(),
    getPublicReviewsSummary(),
    getSiteImages(preview),
    getSiteCraft(preview),
  ]);
  const serviceCategories = groupByCategory(services);

  // Hero + galleri fra CMS-bildene, med fallback til de innebygde bildene.
  const dbHero = siteImages.filter((i) => i.section === "hero");
  const heroSlidesFinal: Slide[] = dbHero.length
    ? dbHero.map((i) => ({ type: i.kind, src: i.url }))
    : heroSlides;
  const dbGallery = siteImages.filter((i) => i.section === "gallery");
  const galleryFinal = dbGallery.length
    ? dbGallery.map((i) => ({ src: i.url, alt: i.alt ?? "" }))
    : gallery;
  // Håndverket-blokkene fra CMS, med fallback til de innebygde.
  const craftFinal = siteCraft.length
    ? siteCraft.map((c) => ({ img: c.imageUrl, title: c.title, text: c.body ?? "" }))
    : craft;
  // Enkeltbilder for «Om oss» og banneret (første aktive), med fallback.
  const aboutImg =
    siteImages.find((i) => i.section === "about")?.url ?? "/img/neckline.jpg";
  const bannerImg =
    siteImages.find((i) => i.section === "banner")?.url ?? "/img/neon-sign.jpg";
  const accentStyle = {
    ["--color-accent-soft"]: s.accent_hex,
  } as CSSProperties;

  const ratingLabel =
    omdomme.blendedCount > 0
      ? `${omdomme.blendedRating.toFixed(1).replace(".", ",")} / 5`
      : s.show_rating
        ? `${s.rating_value.toString().replace(".", ",")} / 5`
        : null;
  const ratingCount =
    omdomme.blendedCount > 0 ? omdomme.blendedCount : s.rating_count;

  return (
    <SmoothScroll>
      <div
        id="top"
        className="cine cine-grain bg-canvas text-fg"
        style={accentStyle}
      >
        <ScrollProgress />
        <Header overlay phone={s.phone} address={s.address} />

        {/* ===================== HERO ===================== */}
        <section className="cine-vignette relative flex min-h-screen items-end overflow-hidden">
          <div className="absolute inset-0">
            <ScaleIn className="h-full w-full" from={1.2} to={1.04}>
              <HeroCarousel slides={heroSlidesFinal} poster="/media/hero/poster.jpg" />
            </ScaleIn>
          </div>
          {/* Overlays for lesbarhet / filmatisk dybde */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

          <div className="relative mx-auto w-full max-w-6xl px-5 pt-44 pb-24 sm:pb-32">
            <p
              className="rise text-[11px] font-semibold tracking-[0.4em] text-accent-soft uppercase"
              style={rise(100)}
            >
              Oslo · Osterhaus&apos; gate 10 · Siden {s.established}
            </p>
            <h1 className="mt-6 font-display text-[18vw] leading-[0.82] font-bold tracking-[-0.02em] text-white sm:text-[11rem]">
              <span className="rise block" style={rise(220)}>
                Downtown
              </span>
              <span
                className="rise block italic text-accent-soft"
                style={rise(360)}
              >
                Barbers
              </span>
            </h1>
            <p
              className="rise mt-8 max-w-xl font-display text-2xl leading-snug text-white/95 sm:text-3xl"
              style={rise(520)}
            >
              {s.hero_title}{" "}
              <span className="italic text-accent-soft">{s.hero_italic}</span>
            </p>
            <p className="rise mt-5 max-w-lg text-white/65" style={rise(640)}>
              {s.intro}
            </p>
            <div
              className="rise mt-10 flex flex-wrap items-center gap-4"
              style={rise(760)}
            >
              <a
                href="/booking"
                className="cine-btn bg-accent-soft px-9 py-4 text-base font-semibold text-[#211E1A]"
              >
                Bestill time
              </a>
              <a
                href="#handverket"
                className="border border-white/25 px-9 py-4 text-base font-semibold text-white transition-colors hover:border-white hover:bg-white/10"
              >
                Se håndverket
              </a>
              {ratingLabel && (
                <div className="flex flex-col gap-0.5 pl-1">
                  <span className="text-sm text-white/85">
                    <span className="text-accent-soft">★</span> {ratingLabel}
                  </span>
                  <span className="text-[11px] text-white/45">
                    {ratingCount} vurderinger
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Scroll-hint */}
          <div className="pointer-events-none absolute inset-x-0 bottom-7 flex justify-center">
            <div className="bob flex flex-col items-center gap-1.5 text-white/55">
              <span className="text-[9px] tracking-[0.35em] uppercase">Scroll</span>
              <span aria-hidden>↓</span>
            </div>
          </div>
        </section>

        {/* ===================== OM OSS ===================== */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-24 md:grid-cols-2 md:py-36">
            <FadeUp>
              <Label>Om oss</Label>
              <p className="mt-7 font-display text-3xl leading-[1.15] sm:text-4xl">
                {s.about_text}
              </p>
              <a
                href="/booking"
                className="group mt-9 inline-flex items-center gap-2 text-sm font-semibold text-accent-soft transition-colors hover:text-fg"
              >
                Bestill din time
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </a>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="relative aspect-[4/5] overflow-hidden">
                <Parallax className="absolute inset-x-0 -top-[12%] h-[124%]" amount={10}>
                  <img
                    src={aboutImg}
                    alt="Barber som renser nakkelinjen hos Downtown Barbers"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </Parallax>
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute bottom-5 left-5 text-[10px] font-semibold tracking-[0.34em] text-white/90 uppercase">
                  Osterhaus&apos; gate 10 · Oslo
                </span>
              </div>
            </FadeUp>
          </div>
        </section>

        {/* ===================== HÅNDVERKET ===================== */}
        <section id="handverket" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-36">
            <Label>Håndverket</Label>
            <SplitReveal
              as="h2"
              text="Det du kjenner idet du reiser deg fra stolen."
              className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] sm:text-6xl"
            />
            <Hairline className="mt-10" />
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {craftFinal.map((c, i) => (
                <FadeUp key={c.img} delay={i * 0.08}>
                  <figure className="group relative aspect-[3/4] overflow-hidden">
                    <Parallax className="absolute inset-x-0 -top-[10%] h-[120%]" amount={8}>
                      <img
                        src={c.img}
                        alt={c.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                      />
                    </Parallax>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <figcaption className="absolute right-6 bottom-6 left-6">
                      <p className="font-display text-2xl font-bold text-white">
                        {c.title}
                      </p>
                      <p className="mt-1.5 text-sm text-white/75">{c.text}</p>
                    </figcaption>
                  </figure>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== GALLERI ===================== */}
        <section id="galleri" className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-36">
            <Label>Galleri</Label>
            <SplitReveal
              as="h2"
              text="Fra stolen"
              className="mt-4 font-display text-4xl font-bold sm:text-5xl"
            />
            <div className="mt-12 gap-5 columns-1 sm:columns-2">
              {galleryFinal.map((g) => (
                <FadeUp key={g.src} className="mb-5 block break-inside-avoid">
                  <div className="overflow-hidden">
                    <ScaleIn from={1.14} to={1}>
                      <img
                        src={g.src}
                        alt={g.alt}
                        loading="lazy"
                        className="w-full object-cover"
                      />
                    </ScaleIn>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== BANNER (parallax) ===================== */}
        <section className="cine-vignette relative flex min-h-[80vh] items-center justify-center overflow-hidden border-b border-line">
          <Parallax className="absolute inset-x-0 -top-[15%] h-[130%]" amount={16}>
            <img
              src={bannerImg}
              alt="Downtown Barbers neonskilt"
              loading="lazy"
              className="h-full w-full object-cover object-center"
            />
          </Parallax>
          <div className="absolute inset-0 bg-black/70" />
          <FadeUp className="relative px-5 text-center" blur>
            <p className="text-[11px] font-semibold tracking-[0.4em] text-accent-soft uppercase">
              Downtown Barbers · Oslo
            </p>
            <p className="mx-auto mt-6 max-w-4xl font-display text-4xl leading-[1.05] font-bold text-white sm:text-6xl">
              {s.slogan}
            </p>
          </FadeUp>
        </section>

        {/* ===================== TJENESTER ===================== */}
        <section id="tjenester" className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-36">
            <Label>Tjenester</Label>
            <SplitReveal
              as="h2"
              text="Prisliste"
              className="mt-4 font-display text-4xl font-bold sm:text-5xl"
            />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {serviceCategories.map((cat, ci) => (
                <FadeUp key={cat.name} delay={ci * 0.08}>
                  <div className="h-full border border-line bg-surface p-8 transition-all duration-500 hover:-translate-y-1.5 hover:border-accent-soft">
                    <h3 className="mb-6 text-sm font-semibold tracking-[0.12em] text-fg uppercase">
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
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== ANMELDELSER ===================== */}
        <GoogleReviews />

        {/* ===================== CTA (cream «intermisjon») ===================== */}
        <section className="border-b border-line bg-accent text-accent-fg">
          <div className="mx-auto max-w-6xl px-5 py-28 text-center md:py-40">
            <FadeUp>
              <h2 className="mx-auto max-w-3xl font-display text-5xl leading-[1.02] font-bold sm:text-7xl">
                {s.cta_title}
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base opacity-75">
                {s.cta_text}
              </p>
              <a
                href="/booking"
                className="cine-btn mt-11 inline-block bg-[#211E1A] px-10 py-4 text-sm font-semibold tracking-[0.1em] text-[#F8F5EF] uppercase"
              >
                Bestill time nå
              </a>
            </FadeUp>
          </div>
        </section>

        {/* ===================== TEAM ===================== */}
        <section id="team" className="border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-24 md:py-36">
            <Label>Teamet</Label>
            <SplitReveal
              as="h2"
              text="Håndverkerne"
              className="mt-4 font-display text-4xl font-bold sm:text-5xl"
            />
            <div className="mt-14 grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-6">
              {team.map((m, i) => (
                <FadeUp key={m.name} delay={i * 0.05}>
                  <div className="group text-center">
                    <div className="mx-auto flex aspect-square w-full items-center justify-center rounded-full bg-surface-2 font-display text-3xl font-bold text-fg ring-1 ring-line transition-all duration-500 group-hover:-translate-y-1 group-hover:text-accent-soft group-hover:ring-accent-soft">
                      {m.name.charAt(0)}
                    </div>
                    <p className="mt-3 font-medium text-fg">{m.name}</p>
                    <p className="text-xs text-muted">{m.title}</p>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>

        {/* ===================== ÅPNINGSTIDER + KONTAKT ===================== */}
        <section id="apningstider" className="border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 md:grid-cols-2 md:py-36">
            <FadeUp>
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
            </FadeUp>
            <FadeUp delay={0.1} id="kontakt">
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
            </FadeUp>
          </div>
        </section>

        <Footer />
      </div>
    </SmoothScroll>
  );
}
