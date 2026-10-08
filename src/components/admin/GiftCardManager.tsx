"use client";

import { useState, useTransition } from "react";
import type { GiftCard } from "@/lib/ops-queries";
import {
  createGiftCard,
  updateGiftCard,
  redeemGiftCard,
  deleteGiftCard,
  setGiftCardBarcode,
} from "@/app/admin/gavekort/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { BarcodeScanner } from "@/components/ui/BarcodeScanner";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

/** Inline strekkode-celle: vis/sett/skann strekkode på et gavekort. */
function GiftBarcodeCell({ id, barcode }: { id: string; barcode: string | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [, start] = useTransition();

  const save = (code: string) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await setGiftCardBarcode(id, code);
      if (r.error) {
        setErr(true);
        setMsg(r.error);
      } else {
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
          className="text-xs"
          onClick={() => {
            setOpen(true);
            setMsg(null);
          }}
        >
          {barcode ? "Endre" : "Koble"}
        </Button>
      </div>
    );
  }
  return (
    <div className="w-64 space-y-1">
      <BarcodeScanner onScan={save} autoFocus />
      {msg && err && <p className="text-xs text-danger">{msg}</p>}
      <button
        onClick={() => {
          setOpen(false);
          setMsg(null);
        }}
        className="act"
      >
        Avbryt
      </button>
    </div>
  );
}

/** Innløs-celle: trekk beløp fra saldo, med pending, saldo-sjekk og resultat. */
function RedeemCell({ id, balance }: { id: string; balance: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [amount, setAmount] = useState("");

  return (
    <div className="space-y-1">
      <form
        action={(fd) => {
          const amt = Number(fd.get("amount") ?? 0);
          if (amt > balance) {
            setMsg({ ok: false, text: `Maks ${kr(balance)}.` });
            return;
          }
          start(async () => {
            setMsg(null);
            const res = await redeemGiftCard(fd);
            if (res.error) setMsg({ ok: false, text: res.error });
            else {
              setAmount("");
              setMsg({ ok: true, text: `Trukket ${kr(amt)} ✓ Ny saldo ${kr(res.newBalance ?? 0)}` });
            }
          });
        }}
        className="flex items-center gap-2"
      >
        <input type="hidden" name="id" value={id} />
        <Input
          name="amount"
          type="number"
          min={1}
          max={balance}
          placeholder="kr"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20"
        />
        <button type="submit" disabled={pending} className="act act-accent">
          {pending ? "Trekker …" : "Trekk"}
        </button>
      </form>
      {msg && (
        <p className={"text-xs " + (msg.ok ? "text-accent-soft" : "text-danger")}>{msg.text}</p>
      )}
    </div>
  );
}

function no(iso: string | null) {
  if (!iso) return "Ingen";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Én gavekort-rad med inline «Rediger»-korrigering av saldo/utløp. */
function GiftCardRow({ card, pending }: { card: GiftCard; pending: boolean }) {
  const [editing, setEditing] = useState(false);
  const [editPending, startEdit] = useTransition();
  const [editErr, setEditErr] = useState<string | null>(null);
  const used = Number(card.balance_nok) <= 0;

  return (
    <>
      <Tr>
        <Td className="font-display font-medium text-fg">{card.code}</Td>
        <Td>
          <GiftBarcodeCell id={card.id} barcode={card.barcode} />
        </Td>
        <Td muted>{kr(card.initial_nok)}</Td>
        <Td>
          <span className={used ? "text-muted" : "font-semibold text-accent-soft"}>
            {kr(card.balance_nok)}
          </span>
        </Td>
        <Td muted>{no(card.expires_at)}</Td>
        <Td>
          {used ? (
            <Badge tone="neutral">Brukt opp</Badge>
          ) : (
            <RedeemCell id={card.id} balance={Number(card.balance_nok)} />
          )}
        </Td>
        <Td align="right">
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="link"
              className="text-xs"
              onClick={() => {
                setEditErr(null);
                setEditing((e) => !e);
              }}
            >
              {editing ? "Lukk" : "Rediger"}
            </Button>
            <ConfirmButton
              label="Slett"
              question={`Slette gavekort ${card.code}?`}
              confirmLabel="Ja, slett"
              pendingLabel="Sletter …"
              disabled={pending}
              onConfirm={() => deleteGiftCard(card.id)}
            />
          </div>
        </Td>
      </Tr>
      {editing && (
        <Tr>
          <Td colSpan={7}>
            <form
              action={(fd) =>
                startEdit(async () => {
                  setEditErr(null);
                  const res = await updateGiftCard(fd);
                  if (res.error) setEditErr(res.error);
                  else setEditing(false);
                })
              }
              className="grid gap-3 sm:grid-cols-2"
            >
              <input type="hidden" name="id" value={card.id} />
              <Field label="Korriger saldo (kr)">
                <Input
                  name="balance_nok"
                  type="number"
                  min={1}
                  defaultValue={card.balance_nok}
                  required
                />
              </Field>
              <Field label="Utløper (valgfritt)">
                <Input
                  name="expires_at"
                  type="date"
                  defaultValue={card.expires_at ? card.expires_at.slice(0, 10) : ""}
                />
              </Field>
              <p className="text-xs text-muted sm:col-span-2">
                Korriger saldo / utløp. Opprinnelig beløp og kode endres ikke.
              </p>
              {editErr && <p className="text-sm text-danger sm:col-span-2">{editErr}</p>}
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="submit" disabled={editPending} className="px-4 py-2 text-sm">
                  {editPending ? "Lagrer …" : "Lagre korrigering"}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setEditErr(null);
                  }}
                  className="act"
                >
                  Avbryt
                </button>
              </div>
            </form>
          </Td>
        </Tr>
      )}
    </>
  );
}

export function GiftCardManager({ cards }: { cards: GiftCard[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const outstanding = cards.reduce((s, c) => s + Number(c.balance_nok), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {cards.length} gavekort · utestående saldo {kr(outstanding)}
        </p>
        <Button
          className="px-4 py-2 text-sm"
          onClick={() => {
            setErr(null);
            setCreated(null);
            setOpen((o) => !o);
          }}
        >
          {open ? "Lukk" : "+ Nytt gavekort"}
        </Button>
      </div>

      {open && (
        <Card>
          <form
            action={(fd) =>
              start(async () => {
                setErr(null);
                const res = await createGiftCard(fd);
                if (res.error) setErr(res.error);
                else {
                  setCreated(res.code ?? null);
                  setOpen(false);
                }
              })
            }
            className="grid gap-3 sm:grid-cols-3"
          >
            <Input name="initial_nok" type="number" min={1} placeholder="Beløp (kr)" required />
            <Input name="code" placeholder="Kode (auto hvis tom)" />
            <Input name="barcode" placeholder="Strekkode (valgfritt)" />
            <Field label="Utløper (valgfritt)">
              <Input name="expires_at" type="date" />
            </Field>
            <Field label="Betalt med (for regnskap)">
              {/* Salg av gavekort er forskudd (ikke momspliktig). Betalingsmåten
                  gjør at dagsbilaget kan føre pengene inn mot gjeldskonto 2900
                  uten mva. Tomt = ikke registrert → føres manuelt. */}
              <select
                name="payment_method"
                defaultValue=""
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft"
              >
                <option value="">Ikke registrert</option>
                <option value="Kontant">Kontant</option>
                <option value="Kort">Kort</option>
                <option value="Vipps">Vipps</option>
              </select>
            </Field>
            {err && <p className="text-sm text-danger sm:col-span-3">{err}</p>}
            <Button type="submit" disabled={pending} className="px-4 py-2 text-sm sm:col-span-3">
              {pending ? "Utsteder …" : "Utsted gavekort"}
            </Button>
          </form>
        </Card>
      )}
      {!open && created && (
        <p className="text-sm text-accent-soft">Gavekort {created} er utstedt ✓</p>
      )}

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Kode</Th>
              <Th>Strekkode</Th>
              <Th>Opprinnelig</Th>
              <Th>Saldo</Th>
              <Th>Utløper</Th>
              <Th>Innløs</Th>
              <Th></Th>
            </Tr>
          </THead>
          <TBody>
            {cards.length === 0 && (
              <TableEmpty colSpan={7}>Ingen gavekort enda.</TableEmpty>
            )}
            {cards.map((c) => (
              <GiftCardRow key={c.id} card={c} pending={pending} />
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
