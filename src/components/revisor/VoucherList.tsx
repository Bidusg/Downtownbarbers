"use client";

import { useState } from "react";
import type { Voucher } from "@/lib/vouchers-queries";
import { voucherSignedUrl } from "@/app/admin/bilag/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

const KIND_LABELS: Record<Voucher["kind"], string> = {
  faktura: "Faktura",
  kvittering: "Kvittering",
  bilag: "Bilag",
  annet: "Annet",
};

/** Bilagsbeløp: hele kroner uten desimaler, ellers to desimaler (øre). */
function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  const whole = Number.isInteger(v);
  return `${v.toLocaleString("nb-NO", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })} kr`;
}

/**
 * Lese-kun liste over bilag for revisor. Nedlasting går via en signert URL
 * fra en server action (voucherSignedUrl) – bøtta er privat, og revisor har
 * ingen skrivetilgang.
 */
export function VoucherList({ vouchers }: { vouchers: Voucher[] }) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function onDownload(id: string) {
    setError(null);
    setBusyId(id);
    // Åpne fanen synkront i klikket: Safari (iPad) blokkerer window.open som
    // skjer etter en await. Fanen pekes til den signerte URL-en når den er klar.
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    try {
      const url = await voucherSignedUrl(id);
      if (url) {
        if (win) win.location.href = url;
        else window.location.href = url;
      } else {
        win?.close();
        setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
      }
    } catch {
      win?.close();
      setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
    } finally {
      setBusyId(null);
    }
  }

  if (vouchers.length === 0) {
    return <EmptyState description="Ingen bilag lastet opp ennå." />;
  }

  return (
    <Card padded={false}>
      {error && (
        <div className="border-b border-danger/30 bg-danger/5 px-6 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <Table className="min-w-[720px]">
        <THead>
          <Tr head>
            <Th>Dato</Th>
            <Th>Tittel</Th>
            <Th>Leverandør</Th>
            <Th>Type</Th>
            <Th align="right">Beløp</Th>
            <Th align="right">Mva</Th>
            <Th align="right">Handling</Th>
          </Tr>
        </THead>
        <TBody>
          {vouchers.map((v) => (
            <Tr key={v.id}>
              <Td muted className="whitespace-nowrap">
                {formatDate(v.voucherDate)}
              </Td>
              <Td className="text-fg">{v.title}</Td>
              <Td muted>{v.supplier || "—"}</Td>
              <Td muted>
                <Badge tone="neutral">{KIND_LABELS[v.kind]}</Badge>
              </Td>
              <Td align="right" nums muted>
                {fmtMoney(v.amountNok)}
              </Td>
              <Td align="right" nums muted>
                {fmtMoney(v.vatNok)}
              </Td>
              <Td>
                <div className="flex items-center justify-end">
                  <Button
                    type="button"
                    variant="link"
                    disabled={busyId === v.id}
                    onClick={() => onDownload(v.id)}
                  >
                    {busyId === v.id ? "Henter …" : "Last ned"}
                  </Button>
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}
