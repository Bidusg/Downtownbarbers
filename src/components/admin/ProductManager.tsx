"use client";

import { useState, useTransition } from "react";
import type { AdminProduct } from "@/lib/admin-queries";
import {
  createProduct,
  toggleProduct,
  deleteProduct,
  setProductBarcode,
} from "@/app/admin/produkter/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { Card } from "@/components/ui/Card";
import {
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmpty,
} from "@/components/ui/Table";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatKr } from "@/lib/format";

/** Inline strekkode-celle: vis/sett/endre strekkode, med skann-mulighet. */
function BarcodeCell({
  id,
  barcode,
}: {
  id: string;
  barcode: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  const save = (code: string) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await setProductBarcode(id, code);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
        setMsg("Lagret ✓");
        setOpen(false);
      }
    });

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <span className={barcode ? "font-mono text-xs text-fg" : "text-xs text-muted"}>
          {barcode || "—"}
        </span>
        <Button
          variant="link"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
          className="text-xs"
        >
          {barcode ? "Endre" : "Sett"}
        </Button>
        {msg && !err && <span className="text-xs text-muted">{msg}</span>}
      </div>
    );
  }
  return (
    <div className="w-64 space-y-1">
      <BarcodeScanner onScan={save} autoFocus />
      {pending && <p className="text-xs text-muted">Lagrer …</p>}
      {msg && err && <p className="text-xs text-danger">{msg}</p>}
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(false);
          setMsg(null);
        }}
        className="act"
      >
        Avbryt
      </Button>
    </div>
  );
}

export function ProductManager({ products }: { products: AdminProduct[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ id: string; msg: string } | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{products.length} produkter</p>
        <Button
          onClick={() => {
            setErr(null);
            setOpen((o) => !o);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Nytt produkt"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            action={(fd) =>
              startSave(async () => {
                setErr(null);
                const res = await createProduct(fd);
                if (res.error) setErr(res.error);
                else setOpen(false);
              })
            }
            className="grid gap-3 sm:grid-cols-2"
          >
            <Input name="name" placeholder="Navn" required />
            <Input name="price_nok" type="number" placeholder="Pris (kr)" required />
            <Input name="stock" type="number" placeholder="Lager" defaultValue={0} />
            <Input name="barcode" placeholder="Strekkode (valgfritt)" />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input name="is_gift_card" type="checkbox" /> Gavekort
            </label>
            <Input name="description" placeholder="Beskrivelse" className="sm:col-span-2" />
            <label className="text-xs text-muted sm:col-span-2">
              Bilde
              <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-xs" />
            </label>
            {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
            <Button type="submit" disabled={saving} className="px-4 py-2 text-sm sm:col-span-2">
              {saving ? "Lagrer …" : "Lagre produkt"}
            </Button>
          </form>
        </Card>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head className="bg-surface-2 uppercase tracking-wide">
              <Th>Produkt</Th>
              <Th>Pris</Th>
              <Th>Lager</Th>
              <Th>Strekkode</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {products.length === 0 && (
              <TableEmpty colSpan={7}>
                Ingen produkter enda – legg til det første, eller koble til databasen.
              </TableEmpty>
            )}
            {products.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium text-fg">{p.name}</Td>
                <Td className="font-display">{formatKr(p.price_nok)}</Td>
                <Td muted>{p.stock}</Td>
                <Td>
                  <BarcodeCell id={p.id} barcode={p.barcode} />
                </Td>
                <Td muted>{p.is_gift_card ? "Gavekort" : "Produkt"}</Td>
                <Td>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={"text-xs " + (p.active ? "text-accent-soft" : "text-muted")}>
                      {p.active ? "Aktiv" : "Skjult"}
                    </span>
                    <button
                      onClick={() =>
                        start(async () => {
                          setRowErr(null);
                          const res = await toggleProduct(p.id, !p.active);
                          if (res.error) setRowErr({ id: p.id, msg: res.error });
                        })
                      }
                      disabled={pending}
                      className={p.active ? "act" : "act act-accent"}
                    >
                      {p.active ? "Deaktiver" : "Aktiver"}
                    </button>
                  </span>
                  {rowErr?.id === p.id && (
                    <p className="mt-1 text-xs text-danger">{rowErr.msg}</p>
                  )}
                </Td>
                <Td align="right">
                  <ConfirmButton
                    label="Slett"
                    confirmLabel="Ja, slett"
                    pendingLabel="Sletter …"
                    disabled={pending}
                    onConfirm={() => deleteProduct(p.id)}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
