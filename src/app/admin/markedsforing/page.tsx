import { StatTile } from "@/components/ui/StatTile";
import { getConsentStats, getMarketingSends, SEGMENTS } from "@/lib/dm-queries";
import { sendMarketing } from "./actions";

export const dynamic = "force-dynamic";

const SEG_LABEL: Record<string, string> = {
  all: "Alle med samtykke",
  gullkunder: "Gullkunder",
  inaktiv: "Inaktive",
};

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminMarkedsforing({
  searchParams,
}: {
  searchParams: Promise<{ sendt?: string; feil?: string; kanal?: string }>;
}) {
  const sp = await searchParams;
  const [stats, sends] = await Promise.all([getConsentStats(), getMarketingSends(20)]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Markedsføring</h1>
        <p className="mt-1 text-sm text-muted">
          Send tilbud og nyheter på e-post eller SMS — kun til kunder som har sagt ja (markedsføringsloven §15).
          Hver utsending har en avmeldingslenke.
        </p>
      </div>

      {sp.sendt !== undefined && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">
              Sendt {sp.kanal === "sms" ? "på SMS" : "på e-post"} til {sp.sendt} mottaker(e).
            </strong>{" "}
            {sp.sendt === "0" &&
              "Ingen i valgt segment har samtykke + riktig kontaktinfo, eller leverandør-nøklene mangler."}
          </p>
        </div>
      )}
      {sp.feil === "tomt" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Emne og tekst må fylles ut.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Kunder totalt" value={String(stats.total)} />
        <StatTile label="Med samtykke" value={String(stats.consenting)} />
        <StatTile label="Kan nås på e-post" value={String(stats.reachable)} sub="samtykke + e-post" />
        <StatTile label="Kan nås på SMS" value={String(stats.smsReachable)} sub="samtykke + telefon" />
      </div>

      {/* Komponér */}
      <form action={sendMarketing} className="space-y-4 border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-bold">Ny utsending</h2>
        <div>
          <label className="mb-1 block text-xs text-muted">Kanal</label>
          <div className="flex gap-4 text-sm text-fg">
            <label className="flex items-center gap-2">
              <input type="radio" name="channel" value="email" defaultChecked className="accent-[#F47721]" />
              E-post
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="channel" value="sms" className="accent-[#F47721]" />
              SMS
            </label>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Segment</label>
          <select name="segment" className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg sm:w-auto">
            {SEGMENTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label} — {s.hint}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">
            Emne <span className="text-muted/70">(kun e-post)</span>
          </label>
          <input
            name="subject"
            placeholder="F.eks. 20 % på skjeggpleie i mars"
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Tekst</label>
          <textarea
            name="body"
            rows={7}
            placeholder="Hei! Vi har et tilbud vi tror du vil like …"
            className="w-full resize-y border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
          />
          <p className="mt-1 text-xs text-muted">
            E-post avsluttes med «Bestill time»-knapp, kontaktinfo og avmeldingslenke.
            SMS får automatisk en kort «Avmeld»-lenke lagt til.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Send til segment
          </button>
          <span className="text-xs text-muted">Sender kun til kunder med samtykke.</span>
        </div>
      </form>

      {/* Logg */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Sendt før</h2>
        </div>
        {sends.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen utsendinger enda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Tid</th>
                  <th className="px-4 py-3 font-medium">Emne</th>
                  <th className="px-4 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 text-right font-medium">Mottakere</th>
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 whitespace-nowrap text-muted">{fmt(s.created_at)}</td>
                    <td className="px-4 py-3">{s.subject}</td>
                    <td className="px-4 py-3 text-muted">{SEG_LABEL[s.segment ?? ""] ?? s.segment ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.recipient_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        E-post sendes via Resend (<span className="font-mono">RESEND_API_KEY</span>). SMS sendes via valgt
        A2P-leverandør (<span className="font-mono">SMS_PROVIDER</span> + nøkler, f.eks. GatewayAPI eller Sveve)
        med avsendernavn <span className="font-mono">SMS_SENDER</span>. Mangler nøklene, hoppes utsendingen stille over.
      </p>
    </div>
  );
}
