"use client";

import { useActionState } from "react";
import { saveTrackingConfig, type TrackingState } from "@/app/admin/integrasjoner/actions";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/Input";
import type { TrackingConfig } from "@/lib/tracking";

/**
 * Sporing: Google Analytics 4, Google Ads og Meta piksel. Lastes bare hos
 * besøkende som godtar i cookie-banneret. Bookinger måles som konvertering.
 */
export function TrackingCard({ initial }: { initial: TrackingConfig }) {
  const [state, action, pending] = useActionState<TrackingState, FormData>(saveTrackingConfig, null);
  const on = [initial.ga4 && "Analytics", initial.adsId && "Google Ads", initial.metaPixel && "Meta"].filter(Boolean);

  return (
    <div id="sporing" className="bo-card scroll-mt-24 border border-line bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sporing og annonser</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Se hvilke kanaler som gir bookinger. Når en ID er lagt inn, får besøkende et
            cookie-banner, og skriptene lastes bare hos dem som sier ja. Fullførte bookinger
            sendes som hendelsen <code>booking_complete</code> (Analytics), som konvertering
            (Google Ads) og som <code>Schedule</code> (Meta).
          </p>
        </div>
        <Badge tone={on.length ? "success" : "neutral"}>{on.length ? on.join(" · ") : "Av"}</Badge>
      </div>

      <form action={action} className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Google Analytics 4 – måle-ID" hint="Analytics → Admin → Datastrømmer. Ser ut som G-XXXXXXX." htmlFor="t-ga4">
          <Input id="t-ga4" name="ga4" defaultValue={initial.ga4} placeholder="G-…" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Meta piksel-ID" hint="Meta Events Manager → Datakilder. Bare tall." htmlFor="t-meta">
          <Input id="t-meta" name="metaPixel" defaultValue={initial.metaPixel} placeholder="123456789012345" inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="Google Ads – konto (konverterings-ID)" hint="Google Ads → Mål → Konverteringer. Ser ut som AW-123456789." htmlFor="t-ads">
          <Input id="t-ads" name="adsId" defaultValue={initial.adsId} placeholder="AW-…" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Google Ads – etikett for «booking»" hint="Teksten etter skråstreken i send_to (AW-…/ETIKETT)." htmlFor="t-label">
          <Input id="t-label" name="adsLabel" defaultValue={initial.adsLabel} placeholder="AbC-D_efGhIjK" autoComplete="off" spellCheck={false} />
        </Field>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="act act-accent">
            {pending ? "Lagrer …" : "Lagre"}
          </button>
          <span className="text-xs text-muted">Tomt felt = slått av.</span>
          {state && (
            <span role="status" className={"text-sm " + (state.ok ? "text-accent-soft" : "text-danger")}>
              {state.message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
