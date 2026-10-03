import type { ReviewConfigStatus } from "@/lib/reviews";
import { saveReviewConfig } from "@/app/admin/rating/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

function KeyBadge({ set }: { set: boolean }) {
  return (
    <Badge
      tone={set ? "accent" : "neutral"}
      className="uppercase tracking-wide"
    >
      {set ? "Nøkkel satt" : "Ikke satt"}
    </Badge>
  );
}

/**
 * Admin kobler til Google + TripAdvisor uten å redigere env i Vercel.
 * Nøkler vises aldri tilbake – tomt felt beholder den lagrede nøkkelen.
 */
export function ReviewConfigForm({ status }: { status: ReviewConfigStatus }) {
  return (
    <form action={saveReviewConfig} className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold">Koble til omdømmekilder</h2>
        <p className="mt-1 text-sm text-muted">
          Legg inn API-nøkler og ID-er her, så telles Google og TripAdvisor
          automatisk med i det samlede snittet. Nøkler lagres trygt (kun admin,
          aldri synlig for besøkende). Oppdatering slår inn innen 6 timer (cache).
        </p>
      </div>

      {/* Google */}
      <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
        <div className="flex items-center justify-between sm:col-span-2">
          <h3 className="font-semibold text-fg">Google</h3>
          <KeyBadge set={status.googleKeySet} />
        </div>
        <Field label="Place-ID">
          <Input
            name="google_place_id"
            defaultValue={status.googlePlaceId}
            placeholder="f.eks. ChIJ…"
          />
        </Field>
        <Field label="API-nøkkel">
          <Input
            name="google_api_key"
            type="password"
            autoComplete="off"
            placeholder={
              status.googleKeySet ? "•••• – la stå tomt for å beholde" : "Lim inn API-nøkkel"
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
          <input
            type="checkbox"
            name="google_enabled"
            defaultChecked={status.googleEnabled}
            className="accent-[#F47721]"
          />
          Vis Google i det samlede omdømmet
        </label>
      </div>

      {/* TripAdvisor */}
      <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
        <div className="flex items-center justify-between sm:col-span-2">
          <h3 className="font-semibold text-fg">TripAdvisor</h3>
          <KeyBadge set={status.taKeySet} />
        </div>
        <Field label="Location-ID">
          <Input
            name="tripadvisor_location_id"
            defaultValue={status.taLocationId}
            placeholder="f.eks. 1234567"
          />
        </Field>
        <Field label="API-nøkkel">
          <Input
            name="tripadvisor_api_key"
            type="password"
            autoComplete="off"
            placeholder={
              status.taKeySet ? "•••• – la stå tomt for å beholde" : "Lim inn API-nøkkel"
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
          <input
            type="checkbox"
            name="tripadvisor_enabled"
            defaultChecked={status.taEnabled}
            className="accent-[#F47721]"
          />
          Vis TripAdvisor i det samlede omdømmet
        </label>
        <p className="text-xs text-muted sm:col-span-2">
          TripAdvisors Content API krever egen tilgang, og nøkkelen bør låses til
          domenet i deres konsoll. Vilkårene krever en lenke tilbake ved offentlig
          visning (håndtert automatisk).
        </p>
      </div>

      <Button type="submit" className="px-5 py-2.5 text-sm">
        Lagre kobling
      </Button>
    </form>
  );
}
