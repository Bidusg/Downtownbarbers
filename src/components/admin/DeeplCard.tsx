"use client";

import { useActionState } from "react";
import { saveDeeplConfig, translateAllNow, type DeeplState } from "@/app/admin/integrasjoner/actions";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Input";

/**
 * Oversettelse med DeepL: nøkkel, automatisk av/på, forbruk og knapp for å
 * oversette alt som mangler. Nøkkelen vises aldri tilbake.
 */
export function DeeplCard({
  keySet,
  fromEnv,
  auto,
  usage,
  usageError,
  translatedCount,
}: {
  keySet: boolean;
  fromEnv: boolean;
  auto: boolean;
  usage: { used: number; limit: number } | null;
  usageError: string | null;
  translatedCount: number | null;
}) {
  const [saveState, saveAction, saving] = useActionState<DeeplState, FormData>(saveDeeplConfig, null);
  const [runState, runAction, running] = useActionState<DeeplState>(translateAllNow, null);
  const nf = new Intl.NumberFormat("nb-NO");
  const pct = usage && usage.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <div id="deepl" className="bo-card scroll-mt-24 border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Oversettelse til engelsk (DeepL)</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tekster dere skriver i admin (tjenester, beskrivelser, forsidetekster og Håndverket)
            oversettes automatisk når de lagres. Oversettelsene lagres, så nettsiden spør ikke
            DeepL ved hvert besøk. Engelsk skrevet for hånd under Tjenester vinner alltid.
          </p>
        </div>
        <Badge tone={keySet ? "success" : "neutral"}>{keySet ? "Aktiv" : "Ikke satt opp"}</Badge>
      </div>

      {keySet && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-[13px] text-muted">Brukt denne måneden</p>
            {usage ? (
              <>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {nf.format(usage.used)} / {nf.format(usage.limit)} tegn
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className="h-full rounded-full bg-accent-soft" style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-danger">{usageError ?? "Ukjent"}</p>
            )}
          </div>
          <div className="rounded-xl bg-canvas p-4">
            <p className="text-[13px] text-muted">Oversatte tekster lagret</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {translatedCount == null ? "—" : nf.format(translatedCount)}
            </p>
          </div>
        </div>
      )}

      <form action={saveAction} className="mt-6 space-y-4" autoComplete="off">
        {fromEnv ? (
          <p className="text-sm text-muted">Nøkkelen er satt i Vercel (DEEPL_API_KEY).</p>
        ) : (
          <Field
            label="DeepL API-nøkkel"
            htmlFor="deepl_api_key"
            hint={
              keySet
                ? "En nøkkel er lagret. La feltet stå tomt for å beholde den."
                : "Opprett gratis konto på deepl.com → «DeepL API Free», og kopier nøkkelen fra kontosiden."
            }
          >
            <Input
              id="deepl_api_key"
              name="deepl_api_key"
              type="text"
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="[-webkit-text-security:disc]"
              placeholder={keySet ? "•••• – la stå tomt for å beholde" : "f.eks. 1a2b3c…:fx"}
            />
          </Field>
        )}
        <label className="flex min-h-11 items-center gap-3 text-sm text-fg">
          <input type="checkbox" name="auto" defaultChecked={auto} className="h-5 w-5 accent-[oklch(var(--fg))]" />
          Oversett automatisk når noe lagres i admin
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="act">
            {saving ? "Lagrer …" : "Lagre"}
          </button>
          {saveState && (
            <p role={saveState.ok ? "status" : "alert"} className={"text-sm " + (saveState.ok ? "text-fg" : "text-danger")}>
              {saveState.message}
            </p>
          )}
        </div>
      </form>

      {keySet && (
        <form action={runAction} className="mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          <button type="submit" disabled={running} className="act act-accent">
            {running ? "Oversetter …" : "Oversett alt som mangler nå"}
          </button>
          {runState && (
            <p role={runState.ok ? "status" : "alert"} className={"text-sm " + (runState.ok ? "text-fg" : "text-danger")}>
              {runState.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
