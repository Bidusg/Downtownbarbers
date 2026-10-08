"use client";

import { useState, useTransition } from "react";
import {
  testVippsConnection,
  type VippsTestResult,
} from "@/app/admin/integrasjoner/vipps-admin-actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/* =====================================================================
 * VIPPS – status + test (admin → Integrasjoner)
 *   Nøklene settes som miljøvariabler i Vercel (ikke her – hemmeligheter
 *   skal ikke ligge i databasen for Vipps). Dette kortet viser hvilke
 *   variabler som er oppdaget, hvilken modus vi kjører i, og lar deg teste
 *   at nøklene faktisk virker (henter kun et access token – ingen betaling).
 * ===================================================================== */

type VarRow = { name: string; set: boolean };

export function VippsCard({
  mode,
  vars,
  envValue,
}: {
  mode: "mock" | "test" | "production";
  vars: VarRow[];
  /** Verdien av VIPPS_ENV (eller tom). */
  envValue: string;
}) {
  const [res, setRes] = useState<VippsTestResult | { error: string } | null>(
    null,
  );
  const [pending, start] = useTransition();

  const badge =
    mode === "production"
      ? { text: "Produksjon", tone: "success" as const }
      : mode === "test"
        ? { text: "Test", tone: "warning" as const }
        : { text: "Mock", tone: "neutral" as const };

  const allSet = vars.every((v) => v.set);

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg">Betaling (Vipps)</h3>
        <Badge tone={badge.tone} className="text-[10px] uppercase tracking-wide">
          {badge.text}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        Vipps i kassa (QR + push til telefon) og online. Nøklene legges inn som
        miljøvariabler i <strong className="text-fg">Vercel</strong> (ikke her) –
        dette kortet bekrefter at de er på plass og virker.
      </p>

      {/* Hvilke variabler er oppdaget */}
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {vars.map((v) => (
          <div key={v.name} className="flex items-center gap-2 text-sm">
            <span
              className={
                "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold " +
                (v.set
                  ? "bg-emerald-600/15 text-emerald-700"
                  : "bg-danger/15 text-danger")
              }
              aria-hidden
            >
              {v.set ? "✓" : "!"}
            </span>
            <code className="text-xs text-fg">{v.name}</code>
            <span className="text-xs text-muted">
              {v.set ? "satt" : "mangler"}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted">
        VIPPS_ENV: <code className="text-fg">{envValue || "(ikke satt)"}</code>
        {mode === "mock" &&
          " · Alle fire nøklene må være satt før Vipps går ut av mock-modus."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          type="button"
          disabled={pending || !allSet}
          onClick={() =>
            start(async () => setRes(await testVippsConnection()))
          }
          className="rounded-md px-4 py-2 text-sm"
        >
          {pending ? "Tester …" : "Test tilkobling"}
        </Button>
        {!allSet && (
          <span className="text-xs text-muted">
            Legg inn alle nøklene i Vercel og redeploy for å kunne teste.
          </span>
        )}
      </div>

      {res && "error" in res && (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {res.error}
        </p>
      )}
      {res && !("error" in res) && (
        <p
          className={
            "mt-3 rounded-md px-3 py-2 text-sm " +
            (res.ok
              ? "border border-accent-soft/40 bg-accent-soft/10 text-fg"
              : "border border-danger/40 bg-danger/10 text-danger")
          }
        >
          {res.ok ? "✓ " : "✗ "}
          {res.message}
        </p>
      )}

      <div className="mt-4 rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-xs text-muted">
        <p className="mb-1 font-semibold text-fg">Slik kobler du til:</p>
        <ol className="list-decimal space-y-0.5 pl-4">
          <li>
            Hent nøklene i Vipps-portalen (portal.vippsmobilepay.com → salgsenhet
            → API-nøkler): client id, client secret, subscription key, MSN.
          </li>
          <li>
            Legg dem i Vercel → Settings → Environment Variables, og sett
            VIPPS_ENV=production (eller test).
          </li>
          <li>Redeploy prosjektet.</li>
          <li>Kom tilbake hit og trykk «Test tilkobling».</li>
        </ol>
        <p className="mt-1">
          QR fungerer direkte. Push til telefon krever at Vipps har godkjent
          PUSH_MESSAGE på avtalen.
        </p>
      </div>
    </div>
  );
}
