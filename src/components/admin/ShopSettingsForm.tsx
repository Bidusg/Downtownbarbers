"use client";

import { useState, useTransition } from "react";
import type { ShopFlags } from "@/lib/shop-settings";
import { saveShopSettings } from "@/app/admin/shop-innstillinger/actions";

function Toggle({
  name,
  defaultChecked,
  checked,
  onChange,
  disabled,
}: {
  name: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center " +
        (disabled ? "opacity-40" : "")
      }
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="absolute inset-0 rounded-full bg-surface-2 transition-colors peer-checked:bg-accent" />
      <span className="absolute left-0.5 h-5 w-5 rounded-full bg-fg transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

function Row({
  title,
  desc,
  badge,
  children,
}: {
  title: string;
  desc: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-4 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-fg">{title}</h3>
          {badge && (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted">{desc}</p>
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

export function ShopSettingsForm({ flags }: { flags: ShopFlags }) {
  const [ff, setFf] = useState(flags.friend_family_discount_enabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  return (
    <form
      action={(fd) =>
        start(async () => {
          setMsg(null);
          setErr(false);
          const r = await saveShopSettings(fd);
          if (r.error) {
            setErr(true);
            setMsg(r.error);
          } else {
            setMsg("Lagret ✓");
          }
        })
      }
      className="border border-line bg-surface p-6"
    >
      <Row
        title="Rabatt i kassa"
        desc="La kasse gi fri rabatt (kr) på en betaling. Skru av hvis det misbrukes."
      >
        <Toggle name="discount_enabled" defaultChecked={flags.discount_enabled} />
      </Row>

      <Row
        title="Venn/familie-rabatt"
        desc="Egen hurtigknapp som trekker en fast prosentsats. Uavhengig av fri rabatt."
      >
        <Toggle
          name="friend_family_discount_enabled"
          checked={ff}
          onChange={setFf}
        />
      </Row>

      {ff && (
        <div className="flex items-center gap-3 border-b border-line py-4">
          <label className="text-sm text-muted" htmlFor="ff_pct">
            Sats (%)
          </label>
          <input
            id="ff_pct"
            name="friend_family_discount_pct"
            type="number"
            min={0}
            max={100}
            defaultValue={flags.friend_family_discount_pct}
            className="w-24 border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft"
          />
        </div>
      )}
      {/* Behold satsen i FormData selv når raden er skjult. */}
      {!ff && (
        <input
          type="hidden"
          name="friend_family_discount_pct"
          value={flags.friend_family_discount_pct}
        />
      )}

      <Row
        title="Drop-in uten kunde"
        desc="Tillat hurtigsalg uten å registrere kundeinfo. Skru av for å kreve kunde på hvert salg."
      >
        <Toggle
          name="dropin_without_customer_enabled"
          defaultChecked={flags.dropin_without_customer_enabled}
        />
      </Row>

      <Row
        title="Dra-for-lengde i kalender"
        desc="La kasse dra en booking for å endre lengde. Funksjonen bygges senere – bryteren er klar."
        badge="Kommer"
      >
        <Toggle
          name="drag_for_length_enabled"
          defaultChecked={flags.drag_for_length_enabled}
        />
      </Row>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? "Lagrer …" : "Lagre innstillinger"}
        </button>
        {msg && (
          <span className={"text-sm " + (err ? "text-danger" : "text-muted")}>
            {msg}
          </span>
        )}
      </div>
    </form>
  );
}
