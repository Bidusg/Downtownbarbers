import type { ReviewConfigStatus } from "@/lib/reviews";
import { saveReviewConfig } from "@/app/admin/rating/actions";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

function KeyBadge({ set }: { set: boolean }) {
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        (set ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
      }
    >
      {set ? "Nøkkel satt" : "Ikke satt"}
    </span>
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
        <label className="text-xs text-muted">
          Place-ID
          <input
            name="google_place_id"
            defaultValue={status.googlePlaceId}
            placeholder="f.eks. ChIJ…"
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted">
          API-nøkkel
          <input
            name="google_api_key"
            type="password"
            autoComplete="off"
            placeholder={
              status.googleKeySet ? "•••• – la stå tomt for å beholde" : "Lim inn API-nøkkel"
            }
            className={`mt-1 ${inputCls}`}
          />
        </label>
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
        <label className="text-xs text-muted">
          Location-ID
          <input
            name="tripadvisor_location_id"
            defaultValue={status.taLocationId}
            placeholder="f.eks. 1234567"
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted">
          API-nøkkel
          <input
            name="tripadvisor_api_key"
            type="password"
            autoComplete="off"
            placeholder={
              status.taKeySet ? "•••• – la stå tomt for å beholde" : "Lim inn API-nøkkel"
            }
            className={`mt-1 ${inputCls}`}
          />
        </label>
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

      <button
        type="submit"
        className="bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
      >
        Lagre kobling
      </button>
    </form>
  );
}
