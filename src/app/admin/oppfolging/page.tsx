import { getDueFollowups } from "@/lib/followups";
import { sendFollowupsNow } from "./actions";

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default async function AdminOppfolging() {
  const due = await getDueFollowups(6);
  const hasAi = !!process.env.ANTHROPIC_API_KEY;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Oppfølging</h1>
        <span className="text-sm text-muted">{due.length} klar</span>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted">
        Kunder som ikke har vært innom på 6+ uker og ikke har en kommende time.
        De får en vennlig «book ny time»-e-post
        {hasAi
          ? ", skrevet av AI (Claude)"
          : " (fast mal – legg til ANTHROPIC_API_KEY i Vercel for AI-tekst)"}
        . Oppfølging kjører også automatisk hver dag.
      </p>

      {!hasAi && (
        <div className="mb-5 border border-line bg-surface px-4 py-3 text-xs text-muted">
          💡 AI-tekst er ikke aktivert enda. Legg til en Anthropic-nøkkel som
          <span className="text-fg"> ANTHROPIC_API_KEY </span>
          i Vercel-miljøvariablene, så skriver Claude personlige meldinger. Uten
          nøkkel brukes en pen standardmal.
        </div>
      )}

      {due.length > 0 && (
        <form action={sendFollowupsNow} className="mb-5">
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Send oppfølging nå ({due.length})
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Siste tjeneste</th>
              <th className="px-4 py-3">Sist besøk</th>
              <th className="px-4 py-3">Uker siden</th>
            </tr>
          </thead>
          <tbody>
            {due.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen kunder er klare for oppfølging akkurat nå. 👍
                </td>
              </tr>
            )}
            {due.map((c) => (
              <tr key={c.customer_id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">{c.full_name}</td>
                <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.last_service ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted">
                  {fmtDate(c.last_visit)}
                </td>
                <td className="px-4 py-3 font-display">{c.weeks_since}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
