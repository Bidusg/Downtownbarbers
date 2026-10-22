"use client";

import { useFormStatus } from "react-dom";
import { useLanguage } from "@/lib/i18n/LanguageProvider";

/** «Ja, avbestill» – låses mens avbestillingen sendes (ingen dobbeltklikk). */
export function CancelSubmit() {
  const { pending } = useFormStatus();
  const { t } = useLanguage();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="pill w-full bg-danger text-white hover:opacity-90 disabled:opacity-60"
    >
      {pending ? "…" : t("cancelpage.yes")}
    </button>
  );
}
