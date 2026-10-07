import type { CSSProperties } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { HeroCarousel, type Slide } from "@/components/site/HeroCarousel";
import { GoogleReviews } from "@/components/site/GoogleReviews";
import {
  SmoothScroll,
  Parallax,
  FadeUp,
  Hairline,
  ScaleIn,
} from "@/components/site/motion/CineFx";
import { T, TOr, TDyn, SplitRevealT } from "@/lib/i18n/T";
import {
  getPublicServices,
  getPublicBarbers,
  groupByCategory,
} from "@/lib/queries";
import { getSiteSettings } from "@/lib/site-settings";
import { getSiteImages, getSiteCraft } from "@/lib/site-images";
import { getPublicLevelPrices } from "@/lib/service-catalog-queries";
import { getUserRole, isAdminRole } from "@/lib/auth";
import { getPublicReviewsSummary } from "@/lib/reviews";
import { getSectionFlags } from "@/lib/site-section-flags";
import { sectionOn } from "@/lib/site-sections-config";
import { siteUrl } from "@/lib/site-url";
import { salon } from "@/lib/data/salon";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

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

  const [services, team, s, omdomme, siteImages, siteCraft, levelPrices, sectionFlags] = await Promise.all([
    getPublicServices(),
    getPublicBarbers(),
    getSiteSettings(),
    getPublicReviewsSummary(),
    getSiteImages(preview),
    getSiteCraft(preview),
    getPublicLevelPrices(),
    getSectionFlags(),
  ]);
  // Av/på per seksjon (admin → Nettside). Preview (?preview=1) viser alt.
  const on = (key: Parameters<typeof sectionOn>[1]) =>
    preview || sectionOn(sectionFlags, key);
  // «fra»-pris i prislista når prisen varierer med barberens nivå.
  const priceVaries = (name: string) => {
    const v = Object.values(levelPrices[name] ?? {});
    return v.length > 1 && Math.min(...v) !== Math.max(...v);
  };
  const serviceCategories = groupByCategory(services);

  // Hero + galleri fra CMS-bildene, med fallback til de innebygde bildene.
  // Kun bilder i heroen (ingen videoer) – filtrerer vekk evt. videoklipp.
  const dbHero = siteImages.filter(
    (i) => i.section === "hero" && i.kind === "image",
  );
  const heroSlidesFinal: Slide[] = dbHero.length
    ? dbHero.map((i) => ({ type: "image" as const, src: i.url }))
    : heroSlides.filter((sl) => sl.type === "image");
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

  // Strukturerte data (schema.org HairSalon) for Google: åpningstider, adresse,
  // telefon og bookinglenke → «rich result» i søk/Maps. Bygget fra samme
  // site_settings som siden viser, så det aldri spriker.
  const DAY_CODE = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const openingHoursSpecification = Object.entries(s.hours ?? {})
    .filter(([, h]) => h && h.open && h.close)
    .map(([dow, h]) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY_CODE[Number(dow)],
      opens: h!.open,
      closes: h!.close,
    }));
  const [streetAddress, rest] = s.address.split(",").map((x) => x.trim());
  const postalMatch = (rest ?? "").match(/^(\d{4})\s+(.+)$/);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    name: s.name || "Downtown Barbers",
    url: siteUrl(),
    telephone: s.phone,
    email: s.email ?? undefined,
    foundingDate: s.established || undefined,
    image: `${siteUrl()}/opengraph-image.jpg`,
    priceRange: "kr",
    address: {
      "@type": "PostalAddress",
      streetAddress,
      postalCode: postalMatch?.[1],
      addressLocality: postalMatch?.[2] ?? "Oslo",
      addressCountry: "NO",
    },
    openingHoursSpecification,
    sameAs: [salon.social.instagram, salon.social.tiktok, salon.social.facebook].filter(Boolean),
    potentialAction: {
      "@type": "ReserveAction",
      target: `${siteUrl()}/booking`,
    },
    ...(omdomme.blendedCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(omdomme.blendedRating.toFixed(1)),
            reviewCount: omdomme.blendedCount,
          },
        }
      : {}),
  };

  return (
    <SmoothScroll>
      <div
        id="top"
        className="cine cine-grain bg-canvas text-fg"
        style={accentStyle}
      >
        <script
          type="application/ld+json"
          // JSON er generert server-side fra egne innstillinger (ingen brukerinput).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ScrollProgress />
        <Header overlay phone={s.phone} address={s.address} />

        {/* ===================== HERO ===================== */}
        <section className="cine-vignette relative flex min-h-[100svh] items-end overflow-hidden">
          <div className="absolute inset-0">
            <ScaleIn className="h-full w-full" from={1.2} to={1.04}>
              <HeroCarousel slides={heroSlidesFinal} poster="/media/hero/poster.jpg" />
            </ScaleIn>
          </div>
          {/* Overlays for lesbarhet / filmatisk dybde */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/70" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-transparent" />

          <div className="relative mx-auto w-full max-w-6xl px-6 pt-28 pb-[20vh] text-center sm:px-5 sm:pt-40 sm:pb-32 sm:text-left">
            <p
              className="rise text-[10px] font-semibold tracking-[0.35em] text-accent-soft uppercase sm:text-[11px] sm:tracking-[0.4em]"
              style={rise(100)}
            >
              Oslo · Osterhaus&apos; gate 10 · <T k="home.hero.since" />{" "}
              {s.established}
            </p>
            <div
              className="rise mt-8 flex flex-wrap items-center justify-center gap-4 sm:justify-start"
              style={rise(260)}
            >
              <a
                href="/booking"
                className="cine-btn bg-accent-soft px-9 py-4 text-base font-semibold text-[#211E1A]"
              >
                <T k="header.book" />
              </a>
              {ratingLabel && (
                <div className="flex flex-col gap-0.5 pl-1">
                  <span className="text-sm text-white/85">
                    <span className="text-accent-soft">★</span> {ratingLabel}
                  </span>
                  <span className="text-[11px] text-white/45">
                    {ratingCount} <T k="home.hero.reviews" />
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

        {/* ===================== TEAM ===================== */}
        {on("team") && (
        <section id="team" className="scroll-mt-20 border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <Label>
              <T k="home.team.eyebrow" />
            </Label>
            <SplitRevealT
              as="h2"
              k="home.team.title"
              className="mt-4 font-display text-3xl font-bold sm:text-4xl"
            />
            <div className="mt-14 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-6 md:grid-cols-6">
              {team.map((m, i) => (
                <FadeUp key={m.name} delay={i * 0.05}>
                  <div className="group text-center">
                    <div className="mx-auto aspect-square w-full max-w-[96px] overflow-hidden rounded-full bg-surface-2 ring-1 ring-line transition-all duration-500 group-hover:-translate-y-1 group-hover:ring-accent-soft">
                      {m.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.photo}
                          alt={m.display}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-display text-xl font-bold text-fg group-hover:text-accent-soft sm:text-3xl">
                          {m.display.charAt(0)}
                        </div>
                      )}
                    </div>
                    <p className="mt-3 font-medium text-fg">{m.display}</p>
                    <p className="text-xs text-muted">
                      <TDyn text={m.title} map="titles" />
                    </p>
                    {/* «Book nå» vises alltid. Har barberen ingen turnus/ekstravakter,
                        viser bookingen rett og slett ingen ledige tider. */}
                    <a
                      href={`/booking?barber=${encodeURIComponent(m.name)}`}
                      className="mt-3 inline-block border border-line px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-fg uppercase transition-colors hover:border-accent-soft hover:bg-accent-soft hover:text-[#211E1A]"
                      aria-label={m.display}
                    >
                      <T k="home.team.book" />
                    </a>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== TJENESTER ===================== */}
        {on("tjenester") && (
        <section id="tjenester" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <Label>
              <T k="home.services.eyebrow" />
            </Label>
            <SplitRevealT
              as="h2"
              k="home.services.title"
              className="mt-4 font-display text-3xl font-bold sm:text-4xl"
            />
            <div className="mt-12 gap-6 sm:columns-2 lg:columns-3">
              {serviceCategories.map((cat, ci) => (
                <div key={cat.name} className="mb-6 break-inside-avoid">
                  <FadeUp delay={ci * 0.08}>
                    <div className="border border-line bg-surface p-7 transition-all duration-500 hover:-translate-y-1.5 hover:border-accent-soft">
                      <h3 className="mb-5 text-sm font-semibold tracking-[0.12em] text-accent-soft uppercase">
                        <TDyn text={cat.name} map="services" />
                      </h3>
                      <ul className="space-y-4">
                        {cat.services.map((sv) => (
                          <li
                            key={sv.name}
                            className="border-b border-line pb-4 last:border-0 last:pb-0"
                          >
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="font-medium text-fg">
                                <TDyn text={sv.name} map="services" />
                              </span>
                              <span className="font-display text-sm whitespace-nowrap text-accent-soft">
                                {priceVaries(sv.name) && (
                                  <span className="mr-1 text-[10px] font-semibold tracking-[0.12em] text-accent-soft/80 uppercase">
                                    <T k="common.from" />
                                  </span>
                                )}
                                {sv.price}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm leading-relaxed text-muted">
                              <TDyn text={sv.description} map="services" />
                            </p>
                            <p className="mt-1 text-xs text-muted">{sv.duration}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </FadeUp>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== HÅNDVERKET ===================== */}
        {on("handverket") && (
        <section id="handverket" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <Label>
              <T k="home.craft.eyebrow" />
            </Label>
            <SplitRevealT
              as="h2"
              k="home.craft.title"
              className="mt-5 max-w-2xl font-display text-3xl font-bold leading-[1.1] sm:text-4xl"
            />
            <Hairline className="mt-10" />
            <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-6 md:mt-14 md:grid-cols-3">
              {craftFinal.map((c, i) => (
                <FadeUp key={c.img} delay={i * 0.08}>
                  <figure className="group relative aspect-[4/3] overflow-hidden sm:aspect-[3/4]">
                    <Parallax className="absolute inset-x-0 -top-[10%] h-[120%]" amount={8}>
                      <img
                        src={c.img}
                        alt={c.title}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                      />
                    </Parallax>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                    <figcaption className="absolute right-4 bottom-4 left-4 sm:right-6 sm:bottom-6 sm:left-6">
                      <p className="font-display text-xl font-bold text-white sm:text-2xl">
                        <TDyn text={c.title} map="settings" />
                      </p>
                      <p className="mt-1.5 text-sm text-white/75">
                        <TDyn text={c.text} map="settings" />
                      </p>
                    </figcaption>
                  </figure>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== GALLERI ===================== */}
        {on("galleri") && (
        <section id="galleri" className="scroll-mt-20 border-b border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <Label>
              <T k="home.gallery.eyebrow" />
            </Label>
            <SplitRevealT
              as="h2"
              k="home.gallery.title"
              className="mt-4 font-display text-3xl font-bold sm:text-4xl"
            />
            <div className="mt-8 columns-2 gap-2.5 sm:mt-12 sm:gap-5">
              {galleryFinal.map((g) => (
                <FadeUp key={g.src} className="mb-2.5 block break-inside-avoid sm:mb-5">
                  <div className="overflow-hidden">
                    <ScaleIn from={1.14} to={1}>
                      <img
                        src={g.src}
                        alt={g.alt}
                        loading="lazy"
                        className="block h-auto w-full"
                      />
                    </ScaleIn>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== OM OSS ===================== */}
        {on("about") && (
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
            <FadeUp>
              <Label>
                <T k="home.about.eyebrow" />
              </Label>
              <p className="mt-6 font-display text-xl leading-[1.3] sm:text-3xl sm:leading-[1.2]">
                <TDyn text={s.about_text} map="settings" />
              </p>
              <a
                href="/booking"
                className="group mt-9 inline-flex items-center gap-2 text-sm font-semibold text-accent-soft transition-colors hover:text-fg"
              >
                <T k="home.about.cta" />
                <span aria-hidden className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </a>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="relative aspect-[4/3] overflow-hidden md:aspect-[4/5]">
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
        )}

        {/* ===================== BANNER (parallax) ===================== */}
        {on("banner") && (
        <section className="cine-vignette relative flex min-h-[55svh] items-center justify-center overflow-hidden border-b border-line sm:min-h-[80vh]">
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
            <p className="mx-auto mt-6 max-w-3xl font-display text-3xl leading-[1.1] font-bold text-white sm:text-5xl">
              <TDyn text={s.slogan} map="settings" />
            </p>
          </FadeUp>
        </section>
        )}

        {/* ===================== ANMELDELSER ===================== */}
        {on("anmeldelser") && <GoogleReviews summary={omdomme} />}

        {/* ===================== CTA (cream «intermisjon») ===================== */}
        {on("cta") && (
        <section className="border-b border-line bg-accent text-accent-fg">
          <div className="mx-auto max-w-6xl px-5 py-20 text-center md:py-28">
            <FadeUp>
              <h2 className="mx-auto max-w-2xl font-display text-4xl leading-[1.05] font-bold sm:text-5xl">
                <TDyn text={s.cta_title} map="settings" />
              </h2>
              <p className="mx-auto mt-6 max-w-md text-base opacity-75">
                <TDyn text={s.cta_text} map="settings" />
              </p>
              <a
                href="/booking"
                className="cine-btn mt-11 inline-block bg-[#211E1A] px-10 py-4 text-sm font-semibold tracking-[0.1em] text-[#F8F5EF] uppercase"
              >
                <T k="home.cta.button" />
              </a>
            </FadeUp>
          </div>
        </section>
        )}

        {/* ===================== ÅPNINGSTIDER + KONTAKT ===================== */}
        {on("apningstider") && (
        <section id="apningstider" className="scroll-mt-20 border-b border-line">
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-16 md:grid-cols-2 md:py-24">
            <FadeUp>
              <Label>
                <T k="home.hours.eyebrow" />
              </Label>
              <ul className="mt-8 space-y-3.5">
                {s.opening_hours.map((o) => (
                  <li
                    key={o.day}
                    className="flex justify-between border-b border-line pb-3.5 text-sm"
                  >
                    <span className="text-fg">
                      <TDyn text={o.day} map="days" />
                    </span>
                    <span className="text-muted">
                      <TDyn text={o.hours} map="days" />
                    </span>
                  </li>
                ))}
              </ul>
            </FadeUp>
            <FadeUp delay={0.1} id="kontakt" className="scroll-mt-28">
              <Label>
                <T k="home.contact.eyebrow" />
              </Label>
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
        )}

        <Footer />
      </div>
    </SmoothScroll>
  );
}
