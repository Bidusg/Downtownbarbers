"use client";

import { useState, useTransition } from "react";
import {
  testTripletex,
  probeTripletexData,
  type TripletexTestResult,
} from "@/app/admin/integrasjoner/tripletex-actions";

export function TripletexCard({
  configured,
  postingEnabled,
  env,
}: {
  configured: boolean;
  postingEnabled: boolean;
  env: string;
}) {
  const [res, setRes] = useState<TripletexTestResult | null>(null);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  const [probe, setProbe] = useState<string | null>(null);
  const [probePending, startProbe] = useTransition();

  const mode = !configured
    ? { text: "Ikke satt", cls: "bg-surface-2 text-muted" }
    : !postingEnabled
      ? { text: "Tørrkjøring", cls: "bg-surface-2 text-fg" }
      : { text: "Aktiv · oppretter utkast", cls: "bg-accent-soft/15 text-accent-soft" };

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg">Regnskap (Tripletex)</h3>
        <span className={"rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " + mode.cls}>
          {mode.text}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        Sender dagsoppgjør som <strong className="text-fg">ubokført utkast</strong> til
        Tripletex ({env}). Revisor ser over og bokfører selv – ingenting bokføres
        automatisk.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => setRes(await testTripletex(date || undefined)))}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Tester …" : "Test tilkobling"}
        </button>
        <button
          type="button"
          disabled={probePending}
          onClick={() =>
            startProbe(async () => {
              const r = await probeTripletexData();
              setProbe(JSON.stringify(r, null, 2));
            })
          }
          className="rounded-md border border-line-2 px-4 py-2 text-sm font-semibold text-fg hover:bg-surface-2 disabled:opacity-40"
          title="Henter små rå-utsnitt fra regnskaps-endepunktene for å bekrefte dataformen (leser kun)"
        >
          {probePending ? "Henter …" : "Hent regnskapsdata (diagnostikk)"}
        </button>
      </div>

      {probe !== null && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-muted">
            Diagnostikk – rå svar fra Tripletex (kontoplan, saldobalanse, hovedbok,
            bilag, mva). Brukes for å bekrefte dataformen før synken bygges.
          </p>
          <pre className="max-h-96 overflow-auto rounded-md border border-line bg-canvas p-3 text-[11px] leading-relaxed text-fg">
            {probe}
          </pre>
        </div>
      )}

      {res && (
        <div className="mt-4 space-y-3 text-sm">
          {res.connection.ok ? (
            <p className="rounded-md border border-accent-soft/40 bg-accent-soft/10 px-3 py-2 text-fg">
              ✓ Tilkoblet Tripletex · <strong>{res.connection.company}</strong>
            </p>
          ) : res.connection.error === "not_configured" ? (
            <p className="rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-muted">
              API-nøkkel ikke satt (TRIPLETEX_API_TOKEN). Viser kun bilagsplan.
            </p>
          ) : (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
              ✗ Tilkobling feilet: {res.connection.error}
            </p>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              Dagsbilag {res.date}
            </p>
            {res.planError ? (
              <p className="text-danger">Kunne ikke bygge bilag: {res.planError}</p>
            ) : !res.plan || res.plan.postings.length === 0 ? (
              <p className="text-muted">Ingen salg denne dagen.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-left text-xs text-muted uppercase">
                    <tr>
                      <th className="px-3 py-2">Konto</th>
                      <th className="px-3 py-2">Navn</th>
                      <th className="px-3 py-2 text-right">Debet</th>
                      <th className="px-3 py-2 text-right">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.plan.postings.map((p) => (
                      <tr key={p.row} className="border-t border-line">
                        <td className="px-3 py-2 font-display text-fg">{p.accountNumber}</td>
                        <td className="px-3 py-2 text-muted">{p.accountName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">
                          {p.amountGross > 0 ? p.amountGross.toLocaleString("nb-NO") : ""}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-fg">
                          {p.amountGross < 0 ? (-p.amountGross).toLocaleString("nb-NO") : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {res.plan && (
              <p className="mt-2 text-xs text-muted">
                {res.plan.count} salg · {res.plan.balanced ? "balanserer ✓" : "balanserer IKKE ✗"}
                {" · mva-modell: "}
                {res.plan.vatMode === "account"
                  ? "brutto (Tripletex regner mva)"
                  : "eksplisitt 2700"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
