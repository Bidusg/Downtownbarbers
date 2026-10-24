import { ContactForm } from "@/components/site/ContactForm";
import type { CSSProperties } from "react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { ScrollProgress } from "@/components/site/ScrollProgress";
import { BackToTop } from "@/components/site/BackToTop";
import { HeroCarousel, type Slide } from "@/components/site/HeroCarousel";
import { GoogleReviews } from "@/components/site/GoogleReviews";
import { SmoothScroll, Parallax, FadeUp } from "@/components/site/motion/CineFx";
import { T, TDyn, SplitRevealT } from "@/lib/i18n/T";
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
import { seoUrl } from "@/lib/site-url";
import { salon } from "@/lib/data/salon";
import { PUBLIC_VIEWPORT } from "@/lib/public-viewport";

export const viewport = PUBLIC_VIEWPORT;

// Eksplisitt canonical for forsiden → https://downtownbarbers.no/ (uten www,
// via metadataBase). Så Google vet at dette er DEN ene adressen og ikke
// indekserer www-/gamle varianter som egne treff.
export const metadata = {
  alternates: { canonical: "/" },
};

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
    url: seoUrl(),
    telephone: s.phone,
    email: s.email ?? undefined,
    foundingDate: s.established || undefined,
    image: `${seoUrl()}/opengraph-image.jpg`,
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
      target: `${seoUrl()}/booking`,
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

  const openDays = Object.values(s.hours ?? {}).filter((h) => h && h.open && h.close).length;
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`;
  const telHref = `tel:${s.phone.replace(/\s/g, "")}`;
  const stats = [
    { value: s.established, label: "home.stats.since" },
    ...(ratingLabel ? [{ value: `${ratingLabel.replace(" / 5", "")} ★`, label: "home.stats.rating" }] : []),
    ...(team.length ? [{ value: String(team.length), label: "home.stats.barbers" }] : []),
    ...(openDays ? [{ value: String(openDays), label: "home.stats.days" }] : []),
  ];

  return (
    <SmoothScroll>
      <div
        id="top"
        className="cine bg-canvas text-fg"
        style={accentStyle}
      >
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:text-canvas"
        >
          <T k="home.skip" />
        </a>
        <script
          type="application/ld+json"
          // JSON er generert server-side fra egne innstillinger (ingen brukerinput).
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ScrollProgress />
        <Header overlay phone={s.phone} address={s.address} />

        <main id="main">
        {/* ===================== HERO (Tesla-stil: fullskjerm, sentrert) ===================== */}
        <section className="relative flex min-h-[100svh] items-end overflow-hidden bg-black">
          <div className="absolute inset-0">
            <HeroCarousel slides={heroSlidesFinal} poster="/media/hero/poster.jpg" />
          </div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

          <div className="relative mx-auto w-full max-w-4xl px-5 pb-[max(4.5rem,8vh)] text-center">
            <p
              className="rise text-[13px] font-semibold tracking-[-0.005em] text-white/75"
              style={rise(80)}
            >
              Oslo · Osterhaus&apos; gate 10 · <T k="home.hero.since" /> {s.established}
            </p>
            <h1
              className="rise m-title mt-3 text-[2.6rem] text-white sm:text-6xl md:text-7xl"
              style={rise(180)}
            >
              Downtown Barbers
            </h1>
            <p
              className="rise m-lead mx-auto mt-4 hidden max-w-xl text-lg text-white/80 sm:block"
              style={rise(300)}
            >
              <T k="home.hero.sub" />
            </p>
            <div
              className="rise mt-6 flex items-center justify-center gap-3 sm:mt-8"
              style={rise(420)}
            >
              <a href="/booking" className="pill pill-primary flex-1 sm:flex-none sm:min-w-52">
                <T k="header.book" />
              </a>
              <a href="#tjenester" className="pill pill-glass flex-1 sm:flex-none sm:min-w-52">
                <T k="home.hero.prices" />
              </a>
            </div>
            {ratingLabel && (
              <p className="rise mt-6 text-[13px] text-white/70 tabular-nums" style={rise(540)}>
                <span className="text-accent-soft" aria-hidden>★</span> {ratingLabel} ·{" "}
                {ratingCount} <T k="home.hero.reviews" />
              </p>
            )}
          </div>
        </section>

        {/* ===================== TEAM ===================== */}
        {on("team") && (
        <section id="team" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-32">
            <FadeUp>
              <p className="m-eyebrow"><T k="home.team.eyebrow" /></p>
              <h2 className="m-title mt-2 text-4xl sm:text-5xl md:text-6xl">
                <T k="home.team.title" />
              </h2>
              <p className="m-lead mt-4 max-w-xl text-lg text-muted">
                <T k="home.team.lead" />
              </p>
            </FadeUp>
            <div className="snap-row -mx-5 mt-12 px-5 pb-2 md:mx-0 md:mt-16 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 lg:grid-cols-4">
              {team.map((m, i) => (
                <FadeUp key={m.name} delay={Math.min(i, 4) * 0.06} className="w-[72%] sm:w-[44%] md:w-auto">
                  <a
                    href={`/booking?barber=${encodeURIComponent(m.name)}`}
                    className="group block"
                  >
                    <div className="tile relative aspect-[4/5] bg-surface-2">
                      {m.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.photo}
                          alt=""
                          width={800}
                          height={1000}
                          loading="lazy"
                          className="h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-b from-surface-2 to-line">
                          <span className="m-title text-7xl text-fg/25">{m.display.charAt(0)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold tracking-tight text-fg">{m.display}</p>
                        <p className="text-sm text-muted">
                          <TDyn text={m.title} map="titles" />
                        </p>
                      </div>
                      <span className="pill pill-soft pill-sm shrink-0 group-hover:bg-fg group-hover:text-canvas">
                        <span className="sr-only"><T k="home.team.bookWith" /> {m.display}: </span>
                        <T k="home.team.book" />
                      </span>
                    </div>
                  </a>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== TJENESTER ===================== */}
        {on("tjenester") && (
        <section id="tjenester" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-32">
            <FadeUp>
              <p className="m-eyebrow"><T k="home.services.eyebrow" /></p>
              <h2 className="m-title mt-2 text-4xl sm:text-5xl md:text-6xl">
                <T k="home.services.title" />
              </h2>
              <p className="m-lead mt-4 max-w-xl text-lg text-muted">
                <T k="home.services.lead" />
              </p>
            </FadeUp>
            <div className="mt-12 grid items-start gap-5 md:mt-16 md:grid-cols-2 lg:grid-cols-3">
              {serviceCategories.map((cat, ci) => (
                <FadeUp key={cat.name} delay={ci * 0.06}>
                  <div className="tile bg-surface p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-24px_rgba(0,0,0,0.18)]">
                    <h3 className="px-4 pt-4 pb-2 text-xl font-semibold tracking-tight text-fg">
                      <TDyn text={cat.name} map="services" />
                    </h3>
                    <ul>
                      {cat.services.map((sv) => (
                        <li key={sv.name}>
                          <a
                            href={`/booking?service=${encodeURIComponent(sv.name)}`}
                            className="group block rounded-2xl px-4 py-3.5 transition-colors hover:bg-surface-2"
                          >
                            <span className="flex items-baseline justify-between gap-4">
                              <span className="font-medium text-fg">
                                <TDyn text={sv.name} map="services" />
                              </span>
                              <span className="text-[15px] font-semibold whitespace-nowrap text-fg tabular-nums">
                                {priceVaries(sv.name) && (
                                  <span className="mr-1 text-xs font-medium text-muted">
                                    <T k="common.from" />
                                  </span>
                                )}
                                {sv.price}
                              </span>
                            </span>
                            {sv.description && (
                              <span className="mt-1 block text-sm leading-relaxed text-muted">
                                <TDyn text={sv.description} map="services" />
                              </span>
                            )}
                            <span className="mt-2 flex items-center justify-between text-xs text-muted">
                              <span className="tabular-nums">{sv.duration}</span>
                              <span className="font-semibold text-accent-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                <T k="header.book" /> ›
                              </span>
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== HÅNDVERKET (bento) ===================== */}
        {on("handverket") && (
        <section id="handverket" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-32">
            <FadeUp>
              <p className="m-eyebrow"><T k="home.craft.eyebrow" /></p>
              <SplitRevealT
                as="h2"
                k="home.craft.title"
                className="m-title mt-2 max-w-3xl text-4xl sm:text-5xl md:text-6xl"
              />
              <p className="m-lead mt-4 max-w-xl text-lg text-muted">
                <T k="home.craft.lead" />
              </p>
            </FadeUp>
            <div className="mt-12 grid gap-4 md:mt-16 md:grid-cols-2 md:gap-5">
              {craftFinal.map((c, i) => (
                <FadeUp
                  key={c.img}
                  delay={i * 0.06}
                  className={i === 0 ? "md:col-span-2" : ""}
                >
                  <figure
                    className={
                      "tile group relative bg-surface-2 " +
                      (i === 0 ? "aspect-[4/5] sm:aspect-[16/9] md:aspect-[21/9]" : "aspect-[4/5] sm:aspect-[4/3]")
                    }
                  >
                    <Parallax className="absolute inset-x-0 -top-[8%] h-[116%]" amount={6}>
                      <img
                        src={c.img}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-[1.04]"
                      />
                    </Parallax>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
                    <figcaption className="absolute right-6 bottom-6 left-6 sm:right-8 sm:bottom-8 sm:left-8">
                      <p className={"m-title text-white " + (i === 0 ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl")}>
                        <TDyn text={c.title} map="settings" />
                      </p>
                      <p className="mt-2 max-w-md text-[15px] text-white/80">
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

        {/* ===================== GALLERI (snap-rad) ===================== */}
        {on("galleri") && (
        <section id="galleri" className="scroll-mt-16 overflow-hidden">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-32">
            <FadeUp>
              <p className="m-eyebrow"><T k="home.gallery.eyebrow" /></p>
              <h2 className="m-title mt-2 text-4xl sm:text-5xl md:text-6xl">
                <T k="home.gallery.title" />
              </h2>
              <p className="m-lead mt-4 max-w-xl text-lg text-muted">
                <T k="home.gallery.lead" />
              </p>
            </FadeUp>
            <div className="snap-row -mx-5 mt-12 px-5 pb-2 md:mt-16">
              {galleryFinal.map((g) => (
                <div
                  key={g.src}
                  className="tile aspect-[4/5] w-[80%] bg-surface-2 sm:w-[46%] lg:w-[31%]"
                >
                  <img
                    src={g.src}
                    alt={g.alt}
                    width={1200}
                    height={1500}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* ===================== BANNER + NØKKELTALL (Tesla-stil) ===================== */}
        {on("banner") && (
        <section className="px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="tile relative mx-auto flex min-h-[78svh] max-w-[1400px] flex-col justify-between bg-black text-white">
            <Parallax className="absolute inset-x-0 -top-[10%] h-[120%]" amount={8}>
              <img
                src={bannerImg}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover object-center"
              />
            </Parallax>
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/10 to-black/80" />
            <FadeUp className="relative px-6 pt-14 text-center sm:pt-20">
              <p className="text-[13px] font-semibold text-white/75">Osterhaus&apos; gate 10 · Oslo</p>
              <h2 className="m-title mt-2 text-4xl sm:text-6xl">
                <T k="home.stats.title" />
              </h2>
            </FadeUp>
            {stats.length > 0 && (
              <FadeUp className="relative px-6 pb-10 sm:pb-14">
                <dl className="mx-auto grid max-w-4xl grid-cols-2 gap-y-8 sm:grid-cols-4">
                  {stats.map((st) => (
                    <div key={st.label} className="flex flex-col-reverse text-center">
                      <dt className="mt-1 text-[13px] text-white/70"><T k={st.label} /></dt>
                      <dd className="m-title text-3xl tabular-nums sm:text-4xl">{st.value}</dd>
                    </div>
                  ))}
                </dl>
              </FadeUp>
            )}
          </div>
        </section>
        )}

        {/* ===================== ANMELDELSER ===================== */}
        {on("anmeldelser") && <GoogleReviews summary={omdomme} />}

        {/* ===================== OM OSS ===================== */}
        {on("about") && (
        <section className="bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-2 md:gap-16 md:py-32">
            <FadeUp>
              <p className="m-eyebrow"><T k="home.about.eyebrow" /></p>
              <p className="m-title mt-3 text-2xl text-fg sm:text-[2.1rem] sm:leading-[1.15]">
                <TDyn text={s.about_text} map="settings" />
              </p>
              <a href="/booking" className="m-link mt-8 text-[17px]">
                <T k="home.about.cta" /> <span aria-hidden>›</span>
              </a>
            </FadeUp>
            <FadeUp delay={0.08}>
              <div className="tile relative aspect-[4/5] bg-surface-2">
                <Parallax className="absolute inset-x-0 -top-[8%] h-[116%]" amount={6}>
                  <img
                    src={aboutImg}
                    alt="Barber som renser nakkelinjen hos Downtown Barbers"
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </Parallax>
              </div>
            </FadeUp>
          </div>
        </section>
        )}

        {/* ===================== CTA ===================== */}
        {on("cta") && (
        <section>
          <div className="mx-auto max-w-4xl px-5 py-24 text-center md:py-36">
            <FadeUp>
              <h2 className="m-title text-5xl sm:text-7xl">
                <TDyn text={s.cta_title} map="settings" />
              </h2>
              <p className="m-lead mx-auto mt-5 max-w-lg text-lg text-muted">
                <TDyn text={s.cta_text} map="settings" />
              </p>
              <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <a href="/booking" className="pill pill-primary sm:min-w-52">
                  <T k="home.cta.button" />
                </a>
                <a href={telHref} className="pill pill-soft sm:min-w-52">
                  <T k="home.contact.call" />
                </a>
              </div>
            </FadeUp>
          </div>
        </section>
        )}

        {/* ===================== ÅPNINGSTIDER + KONTAKT ===================== */}
        {on("apningstider") && (
        <section id="apningstider" className="scroll-mt-16 bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20 md:py-32">
            <FadeUp>
              <h2 className="m-title text-4xl sm:text-5xl md:text-6xl">
                <T k="home.contact.title" />
              </h2>
            </FadeUp>
            <div className="mt-12 grid gap-5 md:mt-16 md:grid-cols-2">
              <FadeUp>
                <div className="tile h-full bg-canvas p-7 sm:p-9">
                  <h3 className="text-xl font-semibold tracking-tight">
                    <T k="home.hours.eyebrow" />
                  </h3>
                  <dl className="mt-6">
                    {s.opening_hours.map((o) => (
                      <div
                        key={o.day}
                        className="flex justify-between gap-4 border-b border-line py-3.5 text-[15px] last:border-0"
                      >
                        <dt className="text-fg">
                          <TDyn text={o.day} map="days" />
                        </dt>
                        <dd className="text-muted tabular-nums">
                          <TDyn text={o.hours} map="days" />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </FadeUp>
              <FadeUp delay={0.06} id="kontakt" className="scroll-mt-24">
                <div className="tile flex h-full flex-col bg-canvas p-7 sm:p-9">
                  <h3 className="text-xl font-semibold tracking-tight">
                    <T k="home.contact.eyebrow" />
                  </h3>
                  <address className="mt-6 space-y-2 text-[17px] not-italic text-fg">
                    <p>{s.address}</p>
                    <p>
                      <a href={telHref} className="tabular-nums hover:text-accent-ink">
                        {s.phone}
                      </a>
                    </p>
                    {s.email && (
                      <p>
                        <a href={`mailto:${s.email}`} className="break-all hover:text-accent-ink">
                          {s.email}
                        </a>
                      </p>
                    )}
                  </address>
                  <div className="mt-auto flex flex-wrap gap-3 pt-8">
                    <a href={telHref} className="pill pill-dark">
                      <T k="home.contact.call" />
                    </a>
                    <a
                      href={mapHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pill pill-soft"
                    >
                      <T k="home.contact.directions" /> <span aria-hidden>↗</span>
                    </a>
                  </div>
                </div>
              </FadeUp>
              {/* Kontaktskjema – «Send oss en melding». */}
              <FadeUp className="md:col-span-2">
                <div className="tile grid gap-10 bg-canvas p-7 sm:p-9 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-14">
                  <div>
                    <h3 className="text-xl font-semibold tracking-tight">
                      <T k="contact.formTitle" />
                    </h3>
                    <p className="mt-4 max-w-sm text-[17px] leading-relaxed text-muted">
                      <T k="contact.formIntro" />
                    </p>
                    <p className="mt-8 text-sm text-muted">
                      <T k="contact.formBook" />
                    </p>
                    <a href="/booking" className="pill pill-primary mt-3">
                      <T k="home.cta.button" />
                    </a>
                  </div>
                  <ContactForm />
                </div>
              </FadeUp>
            </div>
          </div>
        </section>
        )}
        </main>

        <Footer />
      </div>
      <BackToTop />
    </SmoothScroll>
  );
}
