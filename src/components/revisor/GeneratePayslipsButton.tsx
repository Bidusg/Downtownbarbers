"use client";

import { useState, useTransition } from "react";
import {
  generatePayslips,
  type GeneratePayslipsResult,
} from "@/app/revisor/lonnslipper/actions";

/**
 * Revisor-knapp som genererer og sender lønnsoversikter for valgt måned.
 * Krever eksplisitt bekreftelse, viser status via useTransition.
 */
export function GeneratePayslipsButton({
  year,
  month,
  monthLabel,
  staffCount,
}: {
  year: number;
  month: number;
  monthLabel: string;
  staffCount: number;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () => {
    const confirmed = window.confirm(
      `Generer og send lønnsoversikter for ${monthLabel} ${year}?\n\n` +
        `${staffCount} aktive ansatte får en PDF i sin private dokumentmappe. ` +
        `Kan kjøres på nytt – eksisterende lønnsoversikt for måneden erstattes.`,
    );
    if (!confirmed) return;

    setMsg(null);
    start(async () => {
      let r: GeneratePayslipsResult;
      try {
        r = await generatePayslips(year, month);
      } catch {
        setMsg({ ok: false, text: "Noe gikk galt. Prøv igjen." });
        return;
      }
      if (r.error) {
        setMsg({ ok: false, text: r.error });
        return;
      }
      const extra = r.errors?.length ? ` (${r.errors.length} med feil)` : "";
      setMsg({
        ok: true,
        text: `${r.generated} lønnsoversikt${r.generated === 1 ? "" : "er"} generert for ${monthLabel} ${year}${extra}.`,
      });
    });
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || staffCount === 0}
        className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending
          ? "Genererer…"
          : `Generer og send lønnsslipper for ${monthLabel}`}
      </button>
      {msg && (
        <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
