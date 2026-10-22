"use client";

import { useFormStatus } from "react-dom";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** «Ja, meld meg av» – låses mens forespørselen sendes. */
export function UnsubscribeSubmit() {
  const { pending } = useFormStatus();
  const { t } = useLanguage();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="pill pill-dark w-full disabled:opacity-60">
      {pending ? "…" : t("avmeld.yes")}
    </button>
  );
}
