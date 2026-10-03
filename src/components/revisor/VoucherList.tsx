"use client";

import { useState } from "react";
import type { Voucher } from "@/lib/vouchers-queries";
import { voucherSignedUrl } from "@/app/admin/bilag/actions";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

const KIND_LABELS: Record<Voucher["kind"], string> = {
  faktura: "Faktura",
  kvittering: "Kvittering",
  bilag: "Bilag",
  annet: "Annet",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `${n.toLocaleString("nb-NO")} kr`;
}

/**
 * Lese-kun liste over bilag for revisor. Nedlasting går via en signert URL
 * fra en server action (voucherSignedUrl) – bøtta er privat, og revisor har
 * ingen skrivetilgang.
 */
export function VoucherList({ vouchers }: { vouchers: Voucher[] }) {
  const [error, setError] = useState<string | null>(null);

  async function onDownload(id: string) {
    setError(null);
    const url = await voucherSignedUrl(id);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
    }
  }

  if (vouchers.length === 0) {
    return <EmptyState description="Ingen bilag enda." />;
  }

  return (
    <Card padded={false}>
      {error && (
        <div className="border-b border-danger/30 bg-danger/5 px-6 py-3 text-sm text-danger">
          {error}
        </div>
      )}
      <Table>
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
                {fmtDate(v.voucherDate)}
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
                    variant="subtle"
                    onClick={() => onDownload(v.id)}
                    className="px-3 py-1 text-xs"
                  >
                    Last ned
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
