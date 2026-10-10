"use client";

import { useState, useTransition } from "react";
import type { BarberOption } from "@/lib/customer-filter";
import type { CustomerFilterRow } from "@/lib/customer-filter";
import { runCustomerFilter } from "@/app/admin/kunder/filter/actions";
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

/** Ett filter-lag = en avkrysset kriterie. Du stabler de du vil bruke; alle
 *  som er på kombineres med OG. */
export function CustomerFilterPanel({ barbers }: { barbers: BarberOption[] }) {
  // Hvilke lag er på
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
  const [copied, setCopied] = useState(false);

  function run() {
    setErr(null);
    setCopied(false);
    start(async () => {
      const res = await runCustomerFilter({
        barberId: useBarber ? barberId || null : null,
        consent: useConsent ? consent : null,
        notVisitedDays: useVisit ? Math.max(1, Number(notVisitedDays) || 0) : null,
        minSpent: useSpend ? Math.max(0, Number(minSpent) || 0) : null,
      });
      if (res.error) {
        setErr(res.error);
        setRows(null);
        return;
      }
      setRows(res.rows);
    });
  }

  const withConsentEmails = (rows ?? [])
    .filter((r) => r.consent && r.email)
    .map((r) => r.email as string);

  function copyEmails() {
    const text = withConsentEmails.join("; ");
    if (!text) return;
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      },
      () => {},
    );
  }

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

  return (
    <div className="space-y-6">
      <Card title="Velg filtre" >
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
              variant="subtle"
              onClick={copyEmails}
              disabled={withConsentEmails.length === 0}
              className="px-3 py-1.5 text-xs"
            >
              {copied
                ? "Kopiert ✓"
                : `Kopier e-poster med samtykke (${withConsentEmails.length})`}
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
                <TableEmpty colSpan={6}>
                  Ingen kunder matcher filtrene.
                </TableEmpty>
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
              Viser de 500 første. «Kopier e-poster» tar med alle {rows.length}{" "}
              (de med samtykke og e-post).
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
