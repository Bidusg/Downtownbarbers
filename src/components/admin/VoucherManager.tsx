"use client";

import { useRef, useState, useTransition } from "react";
import type { Voucher } from "@/lib/vouchers-queries";
import { uploadVoucher, deleteVoucher, voucherSignedUrl, voucherViewUrl } from "@/app/admin/bilag/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DocViewerButton } from "@/components/ui/DocViewer";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Input, Select, Field } from "@/components/ui/Input";
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

export function VoucherManager({ vouchers }: { vouchers: Voucher[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onUpload(formData: FormData) {
    setError(null);
    setOk(false);
    start(async () => {
      const res = await uploadVoucher(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOk(true);
        formRef.current?.reset();
      }
    });
  }

  async function onDownload(id: string) {
    const url = await voucherSignedUrl(id);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setError("Kunne ikke lage nedlastingslenke. Prøv igjen.");
    }
  }

  return (
    <div className="space-y-8">
      {/* Last opp */}
      <form
        ref={formRef}
        action={onUpload}
        className="space-y-4 border border-line bg-surface p-6"
      >
        <h2 className="font-display text-lg font-bold">Last opp bilag</h2>

        {ok && (
          <EmptyState
            description={
              <>
                <strong className="text-fg">Bilaget ble lastet opp</strong> og er
                nå tilgjengelig for revisor.
              </>
            }
          />
        )}
        {error && (
          <div className="border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        <Field label="Fil">
          <Input
            type="file"
            name="file"
            required
            className="file:mr-3 file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-fg"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tittel" hint="(valgfritt — bruker filnavn)">
            <Input
              name="title"
              placeholder="F.eks. Faktura – rekvisita mars"
            />
          </Field>
          <Field label="Leverandør">
            <Input
              name="supplier"
              placeholder="F.eks. Rekvisita AS"
            />
          </Field>
          <Field label="Type">
            <Select
              name="kind"
              defaultValue="bilag"
            >
              <option value="faktura">Faktura</option>
              <option value="kvittering">Kvittering</option>
              <option value="bilag">Bilag</option>
              <option value="annet">Annet</option>
            </Select>
          </Field>
          <Field label="Bilagsdato">
            <Input
              type="date"
              name="voucher_date"
            />
          </Field>
          <Field label="Beløp (kr)" hint="(inkl. mva)">
            <Input
              name="amount_nok"
              inputMode="decimal"
              placeholder="F.eks. 1234,50"
            />
          </Field>
          <Field label="Herav mva (kr)">
            <Input
              name="vat_nok"
              inputMode="decimal"
              placeholder="F.eks. 246,90"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            className="px-5 py-2 text-sm"
          >
            {pending ? "Laster opp …" : "Last opp"}
          </Button>
          <span className="text-xs text-muted">
            Filen lagres i privat arkiv og deles automatisk med revisor.
          </span>
        </div>
      </form>

      {/* Liste */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bilag</h2>
        </div>

        {vouchers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen bilag enda.</p>
        ) : (
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
                  <Td>{v.title}</Td>
                  <Td muted>{v.supplier || "—"}</Td>
                  <Td>
                    <Badge tone="neutral">{KIND_LABELS[v.kind]}</Badge>
                  </Td>
                  <Td align="right" nums muted>
                    {fmtMoney(v.amountNok)}
                  </Td>
                  <Td align="right" nums muted>
                    {fmtMoney(v.vatNok)}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-3">
                      <DocViewerButton
                        filename={v.title}
                        mime={v.mime}
                        resolveUrl={() => voucherViewUrl(v.id)}
                      />
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={() => onDownload(v.id)}
                        className="px-3 py-1 text-xs"
                      >
                        Last ned
                      </Button>
                      <ConfirmButton
                        label="Slett"
                        confirmLabel="Ja, slett"
                        onConfirm={() => deleteVoucher(v.id)}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
