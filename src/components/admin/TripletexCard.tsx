"use client";

import { useState, useTransition } from "react";
import {
  testTripletex,
  type TripletexTestResult,
} from "@/app/admin/integrasjoner/tripletex-actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

export function TripletexCard({
  configured,
  postingEnabled,
  env,
}: {
  configured: boolean;
  postingEnabled: boolean;
  env: string;
}) {
  const [res, setRes] = useState<TripletexTestResult | null>(null);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();

  const mode = !configured
    ? { text: "Ikke satt", tone: "neutral" as const }
    : !postingEnabled
      ? { text: "Tørrkjøring", tone: "warning" as const }
      : { text: "Aktiv · oppretter utkast", tone: "accent" as const };

  return (
    <div className="border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-fg">Regnskap (Tripletex)</h3>
        <Badge tone={mode.tone} className="text-[10px] uppercase tracking-wide">
          {mode.text}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        Sender dagsoppgjør som <strong className="text-fg">ubokført utkast</strong> til
        Tripletex ({env}). Revisor ser over og bokfører selv – ingenting bokføres
        automatisk.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-auto"
        />
        <Button
          variant="primary"
          type="button"
          disabled={pending}
          onClick={() => start(async () => setRes(await testTripletex(date || undefined)))}
          className="rounded-md px-4 py-2 text-sm"
        >
          {pending ? "Tester …" : "Test tilkobling"}
        </Button>
      </div>

      {res && (
        <div className="mt-4 space-y-3 text-sm">
          {res.connection.ok ? (
            <p className="rounded-md border border-accent-soft/40 bg-accent-soft/10 px-3 py-2 text-fg">
              ✓ Tilkoblet Tripletex · <strong>{res.connection.company}</strong>
            </p>
          ) : res.connection.error === "not_configured" ? (
            <p className="rounded-md border border-line-2 bg-surface-2 px-3 py-2 text-muted">
              API-nøkkel ikke satt (TRIPLETEX_API_TOKEN). Viser kun bilagsplan.
            </p>
          ) : (
            <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-danger">
              ✗ Tilkobling feilet: {res.connection.error}
            </p>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              Dagsbilag {res.date}
            </p>
            {res.planError ? (
              <p className="text-danger">Kunne ikke bygge bilag: {res.planError}</p>
            ) : !res.plan || res.plan.postings.length === 0 ? (
              <p className="text-muted">Ingen salg denne dagen.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line">
                <Table>
                  <THead>
                    <Tr head className="bg-surface-2 uppercase">
                      <Th>Konto</Th>
                      <Th>Navn</Th>
                      <Th align="right">Debet</Th>
                      <Th align="right">Kredit</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {res.plan.postings.map((p) => (
                      <Tr key={p.row}>
                        <Td className="font-display text-fg">{p.accountNumber}</Td>
                        <Td muted>{p.accountName}</Td>
                        <Td align="right" nums className="text-fg">
                          {p.amountGross > 0 ? p.amountGross.toLocaleString("nb-NO") : ""}
                        </Td>
                        <Td align="right" nums className="text-fg">
                          {p.amountGross < 0 ? (-p.amountGross).toLocaleString("nb-NO") : ""}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
            {res.plan && (
              <p className="mt-2 text-xs text-muted">
                {res.plan.count} salg · {res.plan.balanced ? "balanserer ✓" : "balanserer IKKE ✗"}
                {" · mva-modell: "}
                {res.plan.vatMode === "account"
                  ? "brutto (Tripletex regner mva)"
                  : "eksplisitt 2700"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
