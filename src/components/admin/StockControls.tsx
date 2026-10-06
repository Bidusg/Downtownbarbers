"use client";

import { useState, useTransition } from "react";
import {
  adjustStockAction,
  setStockAction,
  setThresholdAction,
} from "@/app/admin/lager/actions";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Msg = { ok: boolean; text: string } | null;

function Feedback({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={"mt-1 text-xs " + (msg.ok ? "text-accent-soft" : "text-danger")}>{msg.text}</p>
  );
}

/**
 * Hurtigknapper (−1 / +1 / +10) for én vare. Alle knappene deaktiveres mens
 * en justering lagres, så et dobbelttrykk ikke telles to ganger.
 */
export function QuickStock({ id, stock }: { id: string; stock: number }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const adjust = (delta: number) =>
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("productId", id);
      fd.set("delta", String(delta));
      fd.set("reason", "justering");
      const res = await adjustStockAction(fd);
      if (res.error) setErr(res.error);
    });

  const btn =
    "h-7 min-w-8 border border-line-2 px-1.5 text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div>
      <div className="flex items-center gap-1.5" aria-busy={pending}>
        <button
          type="button"
          disabled={pending || stock <= 0}
          onClick={() => adjust(-1)}
          className={btn}
          title="Reduser med 1"
        >
          −
        </button>
        <span
          className={
            "w-10 text-center font-display text-base font-bold tabular-nums " +
            (pending ? "opacity-50" : "")
          }
        >
          {stock}
        </span>
        <button type="button" disabled={pending} onClick={() => adjust(1)} className={btn} title="Øk med 1">
          +
        </button>
        <button type="button" disabled={pending} onClick={() => adjust(10)} className={btn} title="Øk med 10">
          +10
        </button>
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </div>
  );
}

/** «Sett til»-felt: setter beholdningen til et absolutt tall. */
export function SetStockForm({ id, stock }: { id: string; stock: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [value, setValue] = useState(String(stock));
  // Følg ny beholdning etter revalidering (f.eks. etter +/- eller skann).
  const [prevStock, setPrevStock] = useState(stock);
  if (prevStock !== stock) {
    setPrevStock(stock);
    setValue(String(stock));
  }

  return (
    <div>
      <form
        action={(fd) =>
          start(async () => {
            setMsg(null);
            const res = await setStockAction(fd);
            setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagret ✓" });
          })
        }
        className="flex items-center gap-1"
      >
        <input type="hidden" name="productId" value={id} />
        <input
          name="target"
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setMsg(null);
          }}
          className="w-16 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg"
        />
        <button type="submit" disabled={pending} className="act">
          {pending ? "…" : "OK"}
        </button>
      </form>
      <Feedback msg={msg} />
    </div>
  );
}

/** Lav-lager-terskel for én vare. */
export function ThresholdForm({ id, threshold }: { id: string; threshold: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <div>
      <form
        action={(fd) =>
          start(async () => {
            setMsg(null);
            const res = await setThresholdAction(fd);
            setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Lagret ✓" });
          })
        }
        className="flex items-center gap-1"
      >
        <input type="hidden" name="productId" value={id} />
        <input
          name="threshold"
          type="number"
          min={0}
          step={1}
          defaultValue={threshold}
          onChange={() => setMsg(null)}
          className="w-14 border border-line-2 bg-canvas px-2 py-1 text-sm text-fg"
        />
        <button type="submit" disabled={pending} className="act">
          {pending ? "Lagrer …" : "Lagre"}
        </button>
      </form>
      <Feedback msg={msg} />
    </div>
  );
}

/** Skjema: registrer varemottak / svinn / opptelling / justering. */
export function StockAdjustForm({
  items,
}: {
  items: { id: string; name: string; stock: number }[];
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);

  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          const res = await adjustStockAction(fd);
          if (res.error) setMsg({ ok: false, text: res.error });
          else {
            const name = items.find((i) => i.id === fd.get("productId"))?.name ?? "Varen";
            const d = Number(fd.get("delta"));
            setMsg({ ok: true, text: `${name}: ${d > 0 ? "+" : ""}${d} registrert ✓` });
          }
        })
      }
      className="grid gap-3 border-t border-line p-6 sm:grid-cols-2"
    >
      <Field label="Produkt">
        <Select name="productId" required>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} (på lager: {i.stock})
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Antall (bruk minus for uttak)">
        <Input name="delta" type="number" step={1} defaultValue={1} required />
      </Field>
      <Field label="Årsak">
        <Select name="reason">
          <option value="varemottak">Varemottak</option>
          <option value="svinn">Svinn</option>
          <option value="telling">Opptelling</option>
          <option value="justering">Justering</option>
        </Select>
      </Field>
      <Field label="Notat (valgfritt)">
        <Input name="note" type="text" />
      </Field>
      {msg && (
        <p className={"text-sm sm:col-span-2 " + (msg.ok ? "text-accent-soft" : "text-danger")}>
          {msg.text}
        </p>
      )}
      <Button type="submit" disabled={pending} className="px-4 py-2 text-sm sm:col-span-2">
        {pending ? "Registrerer …" : "Registrer"}
      </Button>
    </form>
  );
}
