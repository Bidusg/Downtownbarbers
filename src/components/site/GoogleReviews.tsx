import type { AggregatedReview, ReviewSource, ReviewsSummary } from "@/lib/reviews";
import { Reveal } from "@/components/site/Reveal";
import { ReviewsCarousel } from "@/components/site/ReviewsCarousel";
import { T } from "@/lib/i18n/T";

/* =====================================================================
 * ANMELDELSER (forsiden) – ekte anmeldelser fra Google og Tripadvisor.
 *   Data: getPublicReviewsSummary() (nøkler settes i admin → Rating, eller
 *   som env i Vercel). Cachet 6t. Mangler begge kildene → seksjonen skjules.
 *   Vilkår: hver anmeldelse krediteres forfatter + kilde, med lenke tilbake.
 * ===================================================================== */

function Stars({ value, className = "" }: { value: number; className?: string }) {
  const rounded = Math.round(value);
  return (
    <span className={`inline-flex gap-0.5 ${className}`} aria-label={`${value} av 5 stjerner`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={`h-4 w-4 ${i <= rounded ? "text-accent-soft" : "text-line-2"}`}
          fill="currentColor"
          aria-hidden
        >
          <path d="M12 17.27 5.82 21l1.64-7.03L2 9.24l7.19-.61L12 2l2.81 6.63 7.19.61-5.46 4.73L18.18 21 12 17.27z" />
        </svg>
      ))}
    </span>
  );
}

function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z" />
    </svg>
  );
}

/** Nøytral kildemarkør for Tripadvisor (ingen logo-kopi – kilden står også i tekst). */
function TripadvisorIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center rounded-full bg-fg font-display text-[10px] font-bold text-canvas ${className}`}
    >
      T
    </span>
  );
}

const SourceIcon = ({ k, className }: { k: string; className?: string }) =>
  k === "google" ? <GoogleIcon className={className} /> : <TripadvisorIcon className={className} />;

const nf = (n: number) => n.toFixed(1).replace(".", ",");

function SourceChip({ s }: { s: ReviewSource }) {
  const inner = (
    <>
      <SourceIcon k={s.key} className="h-5 w-5" />
      <span className="font-display text-xl font-bold text-fg">{nf(s.rating)}</span>
      <span className="flex flex-col leading-tight">
        <Stars value={s.rating} />
        <span className="text-[11px] text-muted">
          {s.count.toLocaleString("nb-NO")} · {s.label}
        </span>
      </span>
    </>
  );
  return s.url ? (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2 transition-colors hover:border-accent-soft"
    >
      {inner}
    </a>
  ) : (
    <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2">{inner}</div>
  );
}

function ReviewCard({ r }: { r: AggregatedReview }) {
  return (
    <figure className="flex h-full flex-col border border-line bg-surface p-6 sm:p-7">
      <div className="flex items-center gap-3">
        {r.photo ? (
          <img
            src={r.photo}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 font-display font-bold text-fg ring-1 ring-line">
            {r.author.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <figcaption className="truncate font-medium text-fg">
            {r.url ? (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {r.author}
              </a>
            ) : (
              r.author
            )}
          </figcaption>
          {r.when && <p className="text-xs text-muted">{r.when}</p>}
        </div>
        <span title={r.sourceLabel} className="shrink-0">
          <SourceIcon k={r.source} className="h-5 w-5" />
        </span>
      </div>
      <Stars value={r.rating} className="mt-4" />
      <blockquote className="mt-3 line-clamp-6 text-sm leading-relaxed text-fg-soft">{r.text}</blockquote>
    </figure>
  );
}

export function GoogleReviews({ summary }: { summary: ReviewsSummary }) {
  const external = summary.sources.filter(
    (s) => (s.key === "google" || s.key === "tripadvisor") && s.count > 0,
  );
  const reviews = summary.recent.filter((r) => r.source !== "internal").slice(0, 9);
  if (external.length === 0 || reviews.length === 0) return null;

  return (
    <section id="anmeldelser" className="border-b border-line bg-surface-2">
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-28">
        <Reveal>
          <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            <T k="reviews.eyebrow" />
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              <T k="reviews.title" />
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {external.map((s) => (
                <SourceChip key={s.key} s={s} />
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-10 md:mt-12">
          <ReviewsCarousel>
            {reviews.map((r, i) => (
              <ReviewCard key={`${r.source}-${r.author}-${i}`} r={r} />
            ))}
          </ReviewsCarousel>
        </Reveal>

        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          {external.map(
            (s) =>
              s.url && (
                <a
                  key={s.key}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent-soft transition-colors hover:text-fg"
                >
                  <SourceIcon k={s.key} />
                  {s.key === "google" ? <T k="reviews.seeAll" /> : <T k="reviews.seeAllTa" />}
                  <span aria-hidden>→</span>
                </a>
              ),
          )}
        </div>
      </div>
    </section>
  );
}
