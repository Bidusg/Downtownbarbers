import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import {
  getConsentStats,
  getMarketingSends,
  getRecentInbound,
  SEGMENTS,
} from "@/lib/dm-queries";
import { sendMarketing, resumeMarketing, sendToRest, previewRest } from "./actions";
import { getPublicBarbers } from "@/lib/queries";
import { after } from "next/server";
import { kickMarketingWorker } from "@/lib/marketing-worker";
import { siteUrl } from "@/lib/site-url";
import { SendRestButton } from "@/components/admin/SendRestButton";
import { SendMarketingButton } from "@/components/admin/SendMarketingButton";
import { AutoRefresh } from "@/components/kasse/AutoRefresh";

const INBOUND_LABEL: Record<string, string> = {
  stop: "STOPP – avmeldt",
  start: "START – påmeldt",
  other: "Annet svar",
};

export const dynamic = "force-dynamic";
// Server actions på siden (utsending) kjører første bolk i bakgrunnen etter svaret.
export const maxDuration = 60;

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
  searchParams: Promise<{ sendt?: string; startet?: string; feil?: string; kanal?: string; utelatt?: string; detalj?: string }>;
}) {
  const sp = await searchParams;
  const [stats, sends, inbound, barbers] = await Promise.all([
    getConsentStats(),
    getMarketingSends(20),
    getRecentInbound(15),
    getPublicBarbers(),
  ]);
  // Pågående utsending? Da oppdaterer siden seg selv, og står den stille
  // (ingen fremdrift på 30 s) dyttes bakgrunnsjobben i gang igjen.
  const active = sends.some((x) => x.status === "queued" || x.status === "sending");
  const stale = sends.some(
    (x) =>
      (x.status === "queued" || x.status === "sending") &&
      Date.now() - new Date(x.updated_at ?? x.created_at).getTime() > 30_000,
  );
  if (stale) {
    const base = siteUrl();
    after(async () => {
      await kickMarketingWorker(base);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {active && <AutoRefresh seconds={5} />}
      <PageHeader
        title="Markedsføring"
        description="Send tilbud og nyheter på e-post eller SMS — kun til kunder som har sagt ja (markedsføringsloven §15). Hver utsending har en avmeldingslenke."
      />

      {sp.sendt !== undefined && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">
              Sendt {sp.kanal === "sms" ? "på SMS" : "på e-post"} til {sp.sendt} mottaker(e).
            </strong>{" "}
            {sp.sendt === "0" &&
              "Ingen i valgt segment har samtykke + riktig kontaktinfo, eller leverandøren er ikke ferdig satt opp."}
          </p>
        </div>
      )}
      {sp.startet !== undefined && (
        <div className="flex items-start gap-3 border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm">
          <span className="mt-0.5 text-accent-soft">●</span>
          <p className="text-muted">
            <strong className="text-fg">
              Utsending startet {sp.kanal === "sms" ? "på SMS" : "på e-post"} til {Number(sp.startet).toLocaleString("nb-NO")} mottakere.
            </strong>{" "}
            {sp.utelatt ? `${Number(sp.utelatt).toLocaleString("nb-NO")} som allerede har fått den er utelatt. ` : ""}
            Sendes i bakgrunnen – fremdriften oppdateres under «Sendt før».
          </p>
        </div>
      )}
      {sp.feil === "tilgang" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Du har ikke tilgang til å sende (mangler admin/eier-rolle, eller du må logge inn på nytt).
        </div>
      )}
      {sp.feil === "tomt" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Emne og tekst må fylles ut.
        </div>
      )}
      {sp.feil === "dobbel" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          En identisk utsending (samme emne, kanal og segment) ble startet for under 15 minutter siden – ikke sendt igjen.
        </div>
      )}
      {sp.feil === "ingen" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Ingen i valgt segment har samtykke + riktig kontaktinfo.
        </div>
      )}
      {sp.feil === "resendlogg" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Fikk ikke lest Resend-loggen, så vi vet ikke hvem som har fått den – ingenting sendt.
          Nøkkelen har trolig bare «Sending access»: lag en nøkkel med «Full access» i Resend → API Keys,
          legg den inn i Vercel som <code>RESEND_LOG_KEY</code> og redeploy. Å prøve igjen uten det hjelper ikke.
        </div>
      )}
      {sp.feil === "alleharfatt" && (
        <div className="border border-accent-soft/30 bg-accent-soft/5 px-4 py-3 text-sm text-muted">
          Alle med samtykke har allerede fått denne utsendingen.
        </div>
      )}
      {sp.feil === "db" && (
        <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          Kunne ikke lagre utsendingen i databasen.
          {sp.detalj && (
            <span className="mt-1 block font-mono text-xs break-words text-danger/90">
              {sp.detalj}
            </span>
          )}
          <span className="mt-1 block text-xs text-danger/80">
            Nevner feilen en kolonne (f.eks. <code>email_type</code> / <code>featured_barber</code>),
            kjør <code>KJØR-I-SUPABASE-EPOST-TYPE.sql</code> i Supabase. Gjelder det køen, kjør
            <code> KJØR-I-SUPABASE-UTSENDING-KO.sql</code>.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Kunder totalt" value={String(stats.total)} />
        <StatTile label="Med samtykke" value={String(stats.consenting)} />
        <StatTile label="Kan nås på e-post" value={String(stats.reachable)} sub="samtykke + e-post" />
        <StatTile label="Kan nås på SMS" value={String(stats.smsReachable)} sub="samtykke + telefon" />
      </div>

      {/* Komponér */}
      <Card>
      <form action={sendMarketing} className="space-y-4">
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
          <Select name="segment" className="sm:w-auto">
            {SEGMENTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label} — {s.hint}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Type e-post</label>
            <Select name="email_type">
              <option value="standard">Standard</option>
              <option value="ny_barber">Ny barber (bilde + «Bestill time hos …»)</option>
              <option value="kampanje">Kampanje / tilbud</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Fremhevet barber <span className="text-muted/70">(for «Ny barber»)</span>
            </label>
            <Select name="featured_barber">
              <option value="">— ingen —</option>
              {barbers.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                  {b.title ? ` · ${b.title}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">
            Emne <span className="text-muted/70">(kun e-post)</span>
          </label>
          <Input
            name="subject"
            placeholder="F.eks. 20 % på skjeggpleie i mars"
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
          <SendMarketingButton emailCount={stats.reachable} smsCount={stats.smsReachable} />
          <span className="text-xs text-muted">Sender kun til kunder med samtykke.</span>
        </div>
      </form>
      </Card>

      {/* Logg */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Sendt før</h2>
        </div>
        {sends.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen utsendinger enda.</p>
        ) : (
          <Table>
            <THead>
              <Tr head>
                <Th>Tid</Th>
                <Th>Emne</Th>
                <Th>Segment</Th>
                <Th>Status</Th>
                <Th align="right">Sendt</Th>
              </Tr>
            </THead>
            <TBody>
              {sends.map((s) => (
                <Tr key={s.id}>
                  <Td muted className="whitespace-nowrap">{fmt(s.created_at)}</Td>
                  <Td>{s.subject}</Td>
                  <Td muted>{SEG_LABEL[s.segment ?? ""] ?? s.segment ?? "—"}</Td>
                  <Td>
                    {s.status === "done" || !s.status ? (
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        Ferdig{s.failed ? ` · ${s.failed} feilet` : ""}
                        {s.channel !== "sms" && (
                          <SendRestButton
                            action={sendToRest.bind(null, s.id)}
                            preview={previewRest.bind(null, s.id)}
                            subject={s.subject}
                          />
                        )}
                      </span>
                    ) : s.status === "failed" ? (
                      <form action={resumeMarketing.bind(null, s.id)}>
                        <span className="text-xs text-danger">Stoppet</span>{" "}
                        <button type="submit" className="act act-accent">Fortsett</button>
                      </form>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <span className="inline-flex items-center gap-2 text-xs text-accent-soft">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-soft" />
                          {s.status === "queued" && (s.recipient_count ?? 0) === 0 ? "I kø – starter …" : "Sender …"}{" "}
                          {Math.round(((s.recipient_count ?? 0) / Math.max(1, s.total ?? 1)) * 100)} %
                        </span>
                        <span className="h-1 w-28 overflow-hidden rounded-full bg-line">
                          <span
                            className="block h-full bg-accent-soft transition-[width]"
                            style={{ width: `${Math.round(((s.recipient_count ?? 0) / Math.max(1, s.total ?? 1)) * 100)}%` }}
                          />
                        </span>
                        {s.last_error && <span className="text-[11px] text-danger">{s.last_error.slice(0, 120)}</span>}
                      </span>
                    )}
                  </Td>
                  <Td align="right" nums>
                    {s.total ? `${s.recipient_count} / ${s.total}` : s.recipient_count}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Innkommende svar (STOPP/START) */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Innkommende svar (STOPP/START)</h2>
          <p className="mt-1 text-xs text-muted">
            Kunder som svarer STOPP meldes automatisk av markedsføring; START/JA
            melder på igjen. Booking-påminnelser påvirkes ikke.
          </p>
        </div>
        {inbound.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen innkommende svar enda.</p>
        ) : (
          <Table>
            <THead>
              <Tr head>
                <Th>Tid</Th>
                <Th>Fra</Th>
                <Th>Handling</Th>
                <Th align="right">Kunder endret</Th>
              </Tr>
            </THead>
            <TBody>
              {inbound.map((m) => (
                <Tr key={m.id}>
                  <Td muted className="whitespace-nowrap">{fmt(m.created_at)}</Td>
                  <Td className="font-mono text-xs">{m.from_phone}</Td>
                  <Td>
                    <Badge
                      tone={
                        m.action === "stop"
                          ? "danger"
                          : m.action === "start"
                            ? "accent"
                            : "neutral"
                      }
                    >
                      {INBOUND_LABEL[m.action] ?? m.action}
                    </Badge>
                  </Td>
                  <Td align="right" nums>{m.matched}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted">
        E-post sendes via vår e-postleverandør, og SMS via vår SMS-leverandør med et fast avsendernavn.
        Er en leverandør ikke ferdig satt opp, hoppes utsendingen stille over.
      </p>
    </div>
  );
}
