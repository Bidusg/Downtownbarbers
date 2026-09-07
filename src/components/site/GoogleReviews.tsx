import { getGoogleReviews } from "@/lib/google-reviews";
import { Reveal } from "@/components/site/Reveal";

function Stars({ value, className = "" }: { value: number; className?: string }) {
  const rounded = Math.round(value);
  return (
    <span
      className={`inline-flex gap-0.5 ${className}`}
      aria-label={`${value} av 5 stjerner`}
    >
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

/**
 * Ekte Google-anmeldelser. Skjuler seg selv (returnerer null) dersom
 * integrasjonen ikke er konfigurert eller Google ikke gir treff.
 */
export async function GoogleReviews() {
  const data = await getGoogleReviews();
  if (!data) return null;

  const ratingText = data.rating.toFixed(1).replace(".", ",");

  return (
    <section id="anmeldelser" className="border-b border-line bg-surface-2">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <p className="text-[10px] font-semibold tracking-[0.3em] text-accent-soft uppercase">
            Anmeldelser
          </p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl font-bold sm:text-4xl">
              Hva kundene sier
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-display text-3xl font-bold text-fg">
                {ratingText}
              </span>
              <span>
                <Stars value={data.rating} />
                <span className="mt-0.5 block text-xs text-muted">
                  {data.total} anmeldelser på Google
                </span>
              </span>
            </div>
          </div>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.reviews.map((r, i) => (
            <Reveal key={`${r.author}-${i}`} delay={(i % 3) * 100} variant="up">
              <figure className="flex h-full flex-col border border-line bg-surface p-7">
                <div className="flex items-center gap-3">
                  {r.photoUri ? (
                    <img
                      src={r.photoUri}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 font-display font-bold text-fg ring-1 ring-line">
                      {r.author.charAt(0)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <figcaption className="truncate font-medium text-fg">
                      {r.author}
                    </figcaption>
                    {r.relativeTime && (
                      <p className="text-xs text-muted">{r.relativeTime}</p>
                    )}
                  </div>
                </div>
                <Stars value={r.rating} className="mt-4" />
                <blockquote className="mt-3 line-clamp-6 text-sm leading-relaxed text-fg-soft">
                  {r.text}
                </blockquote>
              </figure>
            </Reveal>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-4">
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 6.68 9.14 4.75 12 4.75z"
            />
          </svg>
          <span className="text-sm text-muted">Anmeldelser fra Google</span>
          {data.mapsUri && (
            <a
              href={data.mapsUri}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-2 text-sm font-semibold text-accent-soft transition-colors hover:text-fg"
            >
              Se alle på Google
              <span aria-hidden>→</span>
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
