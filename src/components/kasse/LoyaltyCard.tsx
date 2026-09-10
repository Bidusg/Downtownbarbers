"use client";

import { useState, useTransition } from "react";
import { redeemLoyalty } from "@/app/kasse/kunder/[id]/loyalty-actions";

export function LoyaltyCard({
  customerId,
  progress,
  required,
  rewardDue,
}: {
  customerId: string;
  progress: number;
  required: number;
  rewardDue: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const filled = Math.min(progress, required);
  const done = result === "ok";

  return (
    <div
      className={
        "mb-6 border p-5 " +
        (rewardDue && !done
          ? "border-accent-soft bg-accent-soft/10"
          : "border-line bg-surface")
      }
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-muted uppercase">
          Klippekort
        </p>
        <p className="text-sm font-medium text-fg">
          {progress} / {required} klipp
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: required }).map((_, i) => (
          <span
            key={i}
            className={
              "h-4 w-4 rounded-full " +
              (i < filled ? "bg-accent-soft" : "border border-line bg-surface-2")
            }
          />
        ))}
      </div>

      {done ? (
        <p className="mt-4 text-sm font-medium text-accent-soft">
          Gratis klipp registrert ✓ — telleren er nullstilt.
        </p>
      ) : rewardDue ? (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() =>
              start(async () => setResult(await redeemLoyalty(customerId)))
            }
            disabled={pending}
            className="bg-accent-soft px-4 py-2 text-sm font-semibold text-[#211E1A] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Løser inn …" : "Løs inn gratis klipp"}
          </button>
          <span className="text-sm text-accent-soft">Gratis klipp opptjent! 🎉</span>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">
          {required - progress} klipp igjen til gratis klipp.
        </p>
      )}

      {result && result !== "ok" && (
        <p className="mt-3 text-xs text-danger">
          {result === "not_ready"
            ? "Ikke nok klipp til å løse inn ennå."
            : result === "forbidden"
              ? "Du har ikke tilgang til å løse inn."
              : "Noe gikk galt. Prøv igjen."}
        </p>
      )}
    </div>
  );
}
