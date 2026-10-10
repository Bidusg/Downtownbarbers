"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { BarberOption } from "@/lib/customer-filter";
import type { CustomerFilter, CustomerFilterRow } from "@/lib/customer-filter";
import {
  runCustomerFilter,
  sendFilterCampaign,
  previewCampaign,
  testSendCampaign,
} from "@/app/admin/kunder/filter/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";

const field =
  "w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg focus:border-accent-soft focus:outline-none";
const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";
function no(iso: string | null) {
  if (!iso) return "–";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Ferdige maler – prefyller emne, tekst og evt. fremhevede barbere. */
const TEMPLATES: {
  key: string;
  label: string;
  subject: string;
  body: string;
  featured?: string[];
}[] = [
  { key: "", label: "Velg mal (valgfritt) …", subject: "", body: "" },
  {
    key: "ny-barber",
    label: "Barber har sluttet + nye barbere",
    subject: "Takk for alt – og møt barberne våre",
    body: "Hei!\n\nEtter et langt og fint samarbeid har en av barberne våre valgt å gå videre. Vi takker for alle årene – og for tilliten du har vist oss.\n\nDen gode nyheten: teamet vårt er sterkere enn noen gang. Vi har fått inn dyktige, erfarne barbere som gleder seg til å ta vare på deg i stolen. Trykk under for å booke direkte.\n\nVelkommen innom – vi gleder oss til å se deg igjen!\n\nVarme hilsener,\nDowntown Barbers",
    featured: ["Riccardo", "Dawit"],
  },
  {
    key: "savner-deg",
    label: "Vi savner deg (inaktive)",
    subject: "Vi savner deg i stolen",
    body: "Hei!\n\nDet er en stund siden sist – vi vil bare si at du er velkommen tilbake når som helst. Book en time på sekunder under.\n\nVi sees!\nDowntown Barbers",
  },
  {
    key: "kampanje",
    label: "Kampanje / tilbud",
    subject: "Et lite tilbud til deg",
    body: "Hei!\n\nVi har et tilbud vi tror du vil like. Book time under så fikser vi resten.\n\nHilsen Downtown Barbers",
  },
];

export function CustomerFilterPanel({ barbers }: { barbers: BarberOption[] }) {
  const activeBarbers = barbers.filter((b) => b.active);

  // --- Filter-lag ---
  const [useBarber, setUseBarber] = useState(true);
  const [useConsent, setUseConsent] = useState(false);
  const [useVisit, setUseVisit] = useState(false);
  const [useSpend, setUseSpend] = useState(false);

  const [barberId, setBarberId] = useState(barbers[0]?.id ?? "");
  const [consent, setConsent] = useState<"yes" | "no">("yes");
  const [notVisitedDays, setNotVisitedDays] = useState("90");
  const [minSpent, setMinSpent] = useState("1000");

  const [rows, setRows] = useState<CustomerFilterRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function currentFilter(): CustomerFilter {
    return {
      barberId: useBarber ? barberId || null : null,
      consent: useConsent ? consent : null,
      notVisitedDays: useVisit ? Math.max(1, Number(notVisitedDays) || 0) : null,
      minSpent: useSpend ? Math.max(0, Number(minSpent) || 0) : null,
    };
  }

  function run() {
    setErr(null);
    start(async () => {
      const res = await runCustomerFilter(currentFilter());
      if (res.error) {
        setErr(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows);
    });
  }

  const emailable = (rows ?? []).filter((r) => r.consent && r.email);

  const Row = ({
    on,
    setOn,
    label,
    children,
  }: {
    on: boolean;
    setOn: (v: boolean) => void;
    label: string;
    children: React.ReactNode;
  }) => (
    <div className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
      <label className="flex w-44 shrink-0 items-center gap-2 text-sm font-medium text-fg">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="h-4 w-4 accent-[var(--accent)]"
        />
        {label}
      </label>
      <div className={"flex-1 " + (on ? "" : "pointer-events-none opacity-40")}>
        {children}
      </div>
    </div>
  );

  // --- Send e-post ---
  const [campaignOpen, setCampaignOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card title="Velg filtre">
        <p className="mb-3 text-sm text-muted">
          Huk av kriteriene du vil bruke og legg til flere lag. Alle som er på
          må stemme (OG). «Klippet av barber» tar med både bookinger/salg i nye
          systemet og historikk importert fra Fixit.
        </p>

        <Row on={useBarber} setOn={setUseBarber} label="Klippet av barber">
          <select
            value={barberId}
            onChange={(e) => setBarberId(e.target.value)}
            className={field + " max-w-xs"}
          >
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.active ? "" : " (inaktiv)"}
              </option>
            ))}
          </select>
        </Row>

        <Row on={useConsent} setOn={setUseConsent} label="Markedsføringssamtykke">
          <select
            value={consent}
            onChange={(e) => setConsent(e.target.value as "yes" | "no")}
            className={field + " max-w-xs"}
          >
            <option value="yes">Har sagt ja</option>
            <option value="no">Har ikke sagt ja</option>
          </select>
        </Row>

        <Row on={useVisit} setOn={setUseVisit} label="Ikke besøkt på">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={notVisitedDays}
              onChange={(e) => setNotVisitedDays(e.target.value)}
              className={field + " w-28"}
            />
            <span className="text-sm text-muted">dager eller mer</span>
          </div>
        </Row>

        <Row on={useSpend} setOn={setUseSpend} label="Forbruk minst">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={100}
              value={minSpent}
              onChange={(e) => setMinSpent(e.target.value)}
              className={field + " w-32"}
            />
            <span className="text-sm text-muted">kr totalt</span>
          </div>
        </Row>

        <div className="mt-4 flex items-center gap-3">
          <Button
            variant="primary"
            onClick={run}
            disabled={pending}
            className="px-4 py-2 text-sm"
          >
            {pending ? "Søker …" : "Vis kunder"}
          </Button>
          {err && <span className="text-sm text-danger">{err}</span>}
        </div>
      </Card>

      {rows && (
        <Card
          title={`${rows.length} kunder`}
          padded={false}
          actions={
            <Button
              variant="primary"
              onClick={() => setCampaignOpen(true)}
              disabled={emailable.length === 0}
              className="px-3 py-1.5 text-xs"
            >
              Send e-post ({emailable.length})
            </Button>
          }
        >
          <Table>
            <THead>
              <Tr head>
                <Th>Navn</Th>
                <Th>Telefon</Th>
                <Th>E-post</Th>
                <Th>Samtykke</Th>
                <Th align="right">Sist besøkt</Th>
                <Th align="right">Forbruk</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.length === 0 && (
                <TableEmpty colSpan={6}>Ingen kunder matcher filtrene.</TableEmpty>
              )}
              {rows.slice(0, 500).map((r) => (
                <Tr key={r.id}>
                  <Td className="font-medium text-fg">{r.name}</Td>
                  <Td muted>{r.phone ?? "–"}</Td>
                  <Td muted>{r.email ?? "–"}</Td>
                  <Td>
                    {r.consent ? (
                      <span className="text-accent-soft">Ja</span>
                    ) : (
                      <span className="text-muted">Nei</span>
                    )}
                  </Td>
                  <Td align="right" muted nums>
                    {no(r.lastVisit)}
                  </Td>
                  <Td align="right" nums>
                    {kr(r.spent)}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          {rows.length > 500 && (
            <p className="px-4 py-2 text-xs text-muted">
              Viser de 500 første. Utsendingen går til alle {emailable.length}{" "}
              med samtykke og e-post.
            </p>
          )}
        </Card>
      )}

      {campaignOpen && (
        <CampaignModal
          filter={currentFilter()}
          recipientCount={emailable.length}
          barbers={activeBarbers.map((b) => b.name)}
          onClose={() => setCampaignOpen(false)}
        />
      )}
    </div>
  );
}

function CampaignModal({
  filter,
  recipientCount,
  barbers,
  onClose,
}: {
  filter: CustomerFilter;
  recipientCount: number;
  barbers: string[];
  onClose: () => void;
}) {
  const [template, setTemplate] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [featured, setFeatured] = useState<string[]>([]);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [sent, setSent] = useState(false);

  // Angrevindu. Selve utsendingen fyres av ÉN gang via et eget timeout + en
  // «fired»-vakt, slik at den aldri kan bli kalt flere ganger (nedtellingen er
  // kun kosmetisk). Serveren har i tillegg en dobbel-sperre.
  const [countdown, setCountdown] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  function clearTimers() {
    if (tickRef.current) clearInterval(tickRef.current);
    if (fireRef.current) clearTimeout(fireRef.current);
    tickRef.current = null;
    fireRef.current = null;
  }
  // Rydd timere når popupen lukkes/komponenten forsvinner.
  useEffect(() => clearTimers, []);

  function applyTemplate(key: string) {
    setTemplate(key);
    const t = TEMPLATES.find((x) => x.key === key);
    if (!t || !t.key) return;
    setSubject(t.subject);
    setBody(t.body);
    // behold kun de fremhevede som faktisk er aktive barbere
    setFeatured((t.featured ?? []).filter((n) => barbers.includes(n)));
    setPreviewHtml(null);
  }

  function toggleFeatured(name: string) {
    setFeatured((f) =>
      f.includes(name) ? f.filter((x) => x !== name) : [...f, name],
    );
    setPreviewHtml(null);
  }

  function doPreview() {
    setErr(null);
    startBusy(async () => {
      const res = await previewCampaign({ subject, body, featuredBarbers: featured });
      if (res.error) setErr(res.error);
      else setPreviewHtml(res.html ?? null);
    });
  }

  function doTest() {
    setErr(null);
    setMsg(null);
    startBusy(async () => {
      const res = await testSendCampaign({
        subject,
        body,
        featuredBarbers: featured,
        to: testTo,
      });
      if (res.error) setErr(res.error);
      else setMsg(`Testen er sendt til ${testTo}.`);
    });
  }

  function armSend() {
    setErr(null);
    setMsg(null);
    if (!subject.trim() || !body.trim()) {
      setErr("Emne og melding er påkrevd.");
      return;
    }
    if (firedRef.current || countdown !== null) return; // allerede i gang
    clearTimers();
    setCountdown(15);
    // Kun visuell nedtelling – ingen utsending her.
    tickRef.current = setInterval(() => {
      setCountdown((c) => (c && c > 0 ? c - 1 : c));
    }, 1000);
    // Den faktiske utsendingen – nøyaktig én gang etter 15 sek.
    fireRef.current = setTimeout(() => doFire(), 15000);
  }

  function doFire() {
    clearTimers();
    setCountdown(null);
    fireSend();
  }

  function cancelSend() {
    clearTimers();
    setCountdown(null);
    setMsg("Utsending avbrutt.");
  }

  function sendNow() {
    doFire();
  }

  function fireSend() {
    if (firedRef.current) return; // kan bare fyre ÉN gang
    firedRef.current = true;
    startBusy(async () => {
      const res = await sendFilterCampaign({
        filter,
        subject,
        body,
        featuredBarbers: featured,
      });
      if (res.error) setErr(res.error);
      else {
        setSent(true);
        setMsg(`Utsending startet til ${res.count} kunder.`);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-2xl rounded-2xl border border-line bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">
            Send e-post til {recipientCount} kunder
          </h2>
          <button onClick={onClose} className="text-muted hover:text-fg" aria-label="Lukk">
            ✕
          </button>
        </div>

        {sent ? (
          <div className="space-y-3">
            <p className="rounded-md border border-accent-soft/40 bg-accent-soft/10 px-4 py-3 text-sm text-fg">
              ✓ {msg} Du kan følge status under Markedsføring → SMS/e-post.
            </p>
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose} className="px-4 py-2 text-sm">
                Lukk
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Går til de {recipientCount} i filteret som har samtykke og e-post.
              Avmeldings-lenke legges på automatisk.
            </p>

            <div>
              <label className="mb-1 block text-xs text-muted">Mal</label>
              <select
                value={template}
                onChange={(e) => applyTemplate(e.target.value)}
                className={field}
              >
                {TEMPLATES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">Emne</label>
              <input
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  setPreviewHtml(null);
                }}
                placeholder="F.eks. Takk for alt – og møt barberne våre"
                className={field}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">
                Fremhev barbere (hver blir et «Book nå»-kort i e-posten)
              </label>
              <div className="flex flex-wrap gap-2">
                {barbers.length === 0 && (
                  <span className="text-sm text-muted">Ingen aktive barbere.</span>
                )}
                {barbers.map((n) => {
                  const on = featured.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleFeatured(n)}
                      className={
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors " +
                        (on
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-line-2 text-fg hover:border-accent-soft")
                      }
                    >
                      {on ? "✓ " : "+ "}
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-muted">Melding</label>
              <textarea
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setPreviewHtml(null);
                }}
                rows={8}
                placeholder="Skriv meldingen …"
                className={field + " resize-y"}
              />
            </div>

            {/* Forhåndsvisning + test */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="subtle"
                onClick={doPreview}
                disabled={busy}
                className="px-3 py-1.5 text-xs"
              >
                Forhåndsvis
              </Button>
              <span className="mx-1 h-4 w-px bg-line" />
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="din@epost.no"
                className={field + " w-48"}
              />
              <Button
                variant="subtle"
                onClick={doTest}
                disabled={busy || !testTo.trim()}
                className="px-3 py-1.5 text-xs"
              >
                Send test
              </Button>
            </div>

            {previewHtml && (
              <iframe
                title="Forhåndsvisning"
                srcDoc={previewHtml}
                className="h-80 w-full rounded-md border border-line bg-white"
              />
            )}

            {err && <p className="text-sm text-danger">{err}</p>}
            {msg && <p className="text-sm text-accent-soft">{msg}</p>}

            {/* Send / angrevindu */}
            <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
              {countdown !== null ? (
                <>
                  <span className="text-sm text-muted">
                    Sender om <b className="text-fg">{countdown}s</b> …
                  </span>
                  <Button
                    variant="subtle"
                    onClick={sendNow}
                    disabled={busy}
                    className="px-4 py-2 text-sm"
                  >
                    Send likevel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={cancelSend}
                    className="px-4 py-2 text-sm"
                  >
                    Avbryt
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  onClick={armSend}
                  disabled={busy || recipientCount === 0}
                  className="px-4 py-2 text-sm"
                >
                  Send til {recipientCount} kunder
                </Button>
              )}
            </div>
            <p className="text-right text-[11px] text-muted">
              Etter du trykker send har du 15 sekunder på deg til å avbryte – eller «Send likevel» for å sende med en gang.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
