"use client";

import { useState, useTransition } from "react";
import { testReviewConnection } from "@/app/admin/rating/actions";
import type { ReviewConnectionTest as Result, SourceTest } from "@/lib/reviews";

function Row({ label, t }: { label: string; t: SourceTest }) {
  return (
    <li className="flex gap-3 text-sm">
      <span
        className={
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold " +
          (t.ok ? "bg-emerald-600/15 text-emerald-700" : "bg-danger/15 text-danger")
        }
        aria-hidden
      >
        {t.ok ? "✓" : "!"}
      </span>
      <span>
        <span className="font-semibold text-fg">{label}: </span>
        <span className="break-words text-muted">{t.message}</span>
      </span>
    </li>
  );
}

/** Kjører et ekte kall mot Google/TripAdvisor og viser svaret deres. */
export function ReviewConnectionTest() {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<Result | { error: string } | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="act act-accent"
          disabled={pending}
          onClick={() => start(async () => setRes(await testReviewConnection()))}
        >
          {pending ? "Tester …" : "Test kobling"}
        </button>
        <span className="text-xs text-muted">
          Henter direkte fra Google/TripAdvisor nå og viser nøyaktig hva de svarer.
        </span>
      </div>
      {res && "error" in res && <p className="text-sm text-danger">{res.error}</p>}
      {res && !("error" in res) && (
        <ul className="space-y-2 rounded-md border border-line bg-surface-2 p-4">
          <Row label="Lagrede nøkler" t={res.config} />
          <Row label="Google" t={res.google} />
          <Row label="TripAdvisor" t={res.tripadvisor} />
        </ul>
      )}
    </div>
  );
}
