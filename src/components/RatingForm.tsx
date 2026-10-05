"use client";

import { useState } from "react";
import { submitRating } from "@/app/vurder/[id]/actions";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

export function RatingForm({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await submitRating(bookingId, stars, comment);
    setPending(false);
    if (res.error) setError(res.error);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="border border-line bg-surface p-10 text-center">
        <p className="font-display text-3xl font-bold">{t("rate.thanks")}</p>
        <p className="mt-3 text-muted">{t("rate.thanksBody")}</p>
      </div>
    );
  }

  return (
    <div className="border border-line bg-surface p-8">
      <div className="mb-6 flex justify-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setStars(n)}
            className="text-4xl transition-colors"
            aria-label={`${n} ${t("rate.stars")}`}
            aria-pressed={stars === n}
            type="button"
          >
            <span
              className={
                (hover || stars) >= n ? "text-accent-soft" : "text-line-2"
              }
            >
              ★
            </span>
          </button>
        ))}
      </div>
      <textarea
        placeholder={t("rate.comment")}
        aria-label={t("rate.comment")}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        className="w-full border border-line-2 bg-canvas px-3 py-2.5 text-sm text-fg outline-none focus:border-accent-soft"
      />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending || stars === 0}
        className="mt-5 w-full bg-accent px-4 py-3 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? t("rate.sending") : t("rate.send")}
      </button>
    </div>
  );
}
