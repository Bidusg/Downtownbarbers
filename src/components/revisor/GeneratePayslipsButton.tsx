"use client";

import { useState, useTransition } from "react";
import {
  generatePayslips,
  type GeneratePayslipsResult,
} from "@/app/revisor/lonnslipper/actions";

const kr = (n: number) => Math.round(n).toLocaleString("nb-NO") + " kr";

/**
 * Revisor-knapp som genererer og sender lønnsoversikter for valgt måned.
 * To-stegs bekreftelse INNE i siden (ikke window.confirm): viser måned, hvem
 * som får PDF og med hvilket beløp, før noe sendes. Status via useTransition.
 */
export function GeneratePayslipsButton({
  year,
  month,
  monthLabel,
  staffCount,
  recipients = [],
}: {
  year: number;
  month: number;
  monthLabel: string;
  staffCount: number;
  /** Mottakere med beløp – vises i bekreftelsen så revisor ser hva som går ut. */
  recipients?: { name: string; totalNok: number }[];
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{
    ok: boolean;
    text: string;
    emailed?: number;
    } | null>(null);

  const run = () => {
    setConfirming(false);
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
        emailed: r.emailed,
      });
    });
  };

  return (
    <div className="space-y-3">
      {!confirming ? (
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setConfirming(true);
          }}
          disabled={pending || staffCount === 0}
          className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {pending
            ? "Genererer…"
            : `Generer og send lønnsoversikter for ${monthLabel}`}
        </button>
      ) : (
        <div
          role="alertdialog"
          aria-labelledby="payslip-confirm-title"
          className="border border-accent-soft bg-canvas p-4"
        >
          <p id="payslip-confirm-title" className="font-display text-base font-bold text-fg">
            Send lønnsoversikter for {monthLabel} {year}?
          </p>
          <p className="mt-1 text-sm text-muted">
            {staffCount} ansatte får lønnsoversikten på sin Min side (Dokumenter) og
            en e-post med lenke dit – ingen vedlegg. Eksisterende lønnsoversikt for
            måneden erstattes.
          </p>
          {recipients.length > 0 && (
            <ul className="mt-3 divide-y divide-line border-y border-line text-sm">
              {recipients.map((r) => (
                <li key={r.name} className="flex items-center justify-between py-1.5">
                  <span className="text-fg">{r.name}</span>
                  <span className="tabular-nums text-muted">{kr(r.totalNok)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Ja, generer og send til {staffCount}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="border border-line-2 px-4 py-2 text-sm text-fg hover:border-accent-soft"
            >
              Avbryt
            </button>
          </div>
        </div>
      )}
      {msg && (
        <div className="space-y-1">
          <p className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>
            {msg.text}
          </p>
          {msg.ok && typeof msg.emailed === "number" && (
            <p className="text-sm text-muted">
              {msg.emailed} fikk e-post med lenke til lønnsoversikten på Min side.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
