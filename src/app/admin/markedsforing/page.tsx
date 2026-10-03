import { StatTile } from "@/components/ui/StatTile";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
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
import { sendMarketing } from "./actions";

const INBOUND_LABEL: Record<string, string> = {
  stop: "STOPP – avmeldt",
  start: "START – påmeldt",
  other: "Annet svar",
};

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
  const [stats, sends, inbound] = await Promise.all([
    getConsentStats(),
    getMarketingSends(20),
    getRecentInbound(15),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
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
          <Button type="submit" className="px-5 py-2 text-sm">
            Send til segment
          </Button>
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
                <Th align="right">Mottakere</Th>
              </Tr>
            </THead>
            <TBody>
              {sends.map((s) => (
                <Tr key={s.id}>
                  <Td muted className="whitespace-nowrap">{fmt(s.created_at)}</Td>
                  <Td>{s.subject}</Td>
                  <Td muted>{SEG_LABEL[s.segment ?? ""] ?? s.segment ?? "—"}</Td>
                  <Td align="right" nums>{s.recipient_count}</Td>
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
