import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import {
  getTripletexSaldobalanse,
  getTripletexVouchers,
  getLastSync,
} from "@/lib/tripletex/queries";

export const dynamic = "force-dynamic";

const nok = (n: number) => n.toLocaleString("nb-NO") + " kr";
/** Beløp eller «—» for null. */
const kr = (n: number | null) => (n == null ? "—" : nok(n));

/** Formater siste synk-tidspunkt til «Sist synket: …» (Oslo-tid), ellers null. */
function formatLastSync(
  ls: { finished_at: string | null; status: string | null } | null,
): string | null {
  if (!ls?.finished_at) return null;
  const d = new Date(ls.finished_at);
  if (Number.isNaN(d.getTime())) return null;
  const s = d.toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    dateStyle: "short",
    timeStyle: "short",
  });
  return `Sist synket: ${s}`;
}

export default async function RevisorSaldobalanse() {
  await requireRole(["revisor", "admin"]);

  const year = String(new Date().getFullYear());
  const [rows, vouchers, lastSyncRaw] = await Promise.all([
    getTripletexSaldobalanse(year),
    getTripletexVouchers({ limit: 100 }),
    getLastSync(),
  ]);
  const lastSync = formatLastSync(lastSyncRaw);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Saldobalanse"
        description={`Saldobalanse og bilag synket fra Tripletex (hittil i år, ${year}).`}
      />

      {lastSync && <p className="-mt-4 text-xs text-muted">{lastSync}</p>}

      {/* Saldobalanse */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Saldobalanse</h2>
          <p className="text-xs text-muted">Inngående, endring og utgående saldo per konto.</p>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Konto</Th>
              <Th>Navn</Th>
              <Th>Type</Th>
              <Th align="right">Inngående</Th>
              <Th align="right">Endring</Th>
              <Th align="right">Utgående</Th>
            </Tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={6}>Ingen saldobalanse synket ennå.</TableEmpty>
            ) : (
              rows.map((r) => (
                <Tr key={r.account_number}>
                  <Td nums className="text-fg-soft">{r.account_number}</Td>
                  <Td>{r.account_name ?? "—"}</Td>
                  <Td muted>{r.account_type ?? "—"}</Td>
                  <Td align="right" nums>{kr(r.balance_in)}</Td>
                  <Td align="right" nums>{kr(r.balance_change)}</Td>
                  <Td align="right" nums>{kr(r.balance_out)}</Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>

      {/* Bilag */}
      <Card padded={false}>
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Bilag</h2>
          <p className="text-xs text-muted">Siste 100 bilag fra Tripletex (nyeste først).</p>
        </div>
        <Table>
          <THead>
            <Tr head>
              <Th>Nr.</Th>
              <Th>Dato</Th>
              <Th>Beskrivelse</Th>
              <Th>Type</Th>
              <Th>Status</Th>
            </Tr>
          </THead>
          <TBody>
            {vouchers.length === 0 ? (
              <TableEmpty colSpan={5}>Ingen bilag synket ennå.</TableEmpty>
            ) : (
              vouchers.map((v) => (
                <Tr key={v.tripletex_id}>
                  <Td nums className="text-fg-soft">
                    {v.number ?? v.temp_number ?? "—"}
                  </Td>
                  <Td nums muted>{v.voucher_date ?? "—"}</Td>
                  <Td>{v.description ?? "—"}</Td>
                  <Td muted>{v.voucher_type ?? "—"}</Td>
                  <Td>
                    <Badge tone={v.booked ? "success" : "neutral"}>
                      {v.booked ? "Bokført" : "Utkast"}
                    </Badge>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
