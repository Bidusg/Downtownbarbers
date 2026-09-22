"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import {
  updateShopFlags,
  setUserOwner,
} from "@/app/admin/innstillinger/actions";
import type { ShopFlags } from "@/lib/shop-settings";

type OwnerUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  is_owner: boolean;
};

/** En/av-bryter. */
function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-40 " +
        (on ? "bg-accent" : "bg-line-2")
      }
    >
      <span
        className={
          "inline-block h-5 w-5 transform rounded-full bg-white transition-transform " +
          (on ? "translate-x-5" : "translate-x-0.5")
        }
      />
    </button>
  );
}

function FlagRow({
  title,
  desc,
  on,
  onToggle,
  pending,
  children,
}: {
  title: string;
  desc: string;
  on: boolean;
  onToggle: () => void;
  pending: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-fg">{title}</p>
        <p className="text-xs text-muted">{desc}</p>
        {children}
      </div>
      <Toggle on={on} onChange={onToggle} disabled={pending} />
    </div>
  );
}

export function ShopSettingsManager({
  flags,
  users,
}: {
  flags: ShopFlags;
  users: OwnerUser[];
}) {
  const [state, setState] = useState<ShopFlags>(flags);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(patch: Partial<ShopFlags>) {
    setState((s) => ({ ...s, ...patch }));
    setMsg(null);
    start(async () => {
      const r = await updateShopFlags(patch);
      if (r.error) {
        setMsg(r.error);
        setState(flags); // rull tilbake ved feil
      } else {
        setMsg("Lagret ✓");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card title="Funksjoner i kassen">
        <FlagRow
          title="Rabatt"
          desc="Lar ansatte gi rabatt i kassen. Skru av hvis det misbrukes."
          on={state.discountEnabled}
          onToggle={() => save({ discountEnabled: !state.discountEnabled })}
          pending={pending}
        />
        <FlagRow
          title="Drop-in uten registrert kunde"
          desc="Tillat hurtigsalg uten å registrere kundeinfo."
          on={state.dropinWithoutCustomerEnabled}
          onToggle={() =>
            save({
              dropinWithoutCustomerEnabled: !state.dropinWithoutCustomerEnabled,
            })
          }
          pending={pending}
        />
        <FlagRow
          title="Dra-for-lengde på bookinger"
          desc="Juster booking-lengde ved å dra. (Funksjonen bygges – bryteren styrer den når den er klar.)"
          on={state.dragLengthEnabled}
          onToggle={() => save({ dragLengthEnabled: !state.dragLengthEnabled })}
          pending={pending}
        />
        <FlagRow
          title="Venn/familie-rabatt"
          desc="Egen rabatt for venn/familie-bookinger."
          on={state.familyFriendDiscountEnabled}
          onToggle={() =>
            save({
              familyFriendDiscountEnabled: !state.familyFriendDiscountEnabled,
            })
          }
          pending={pending}
        >
          {state.familyFriendDiscountEnabled && (
            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
              Sats:
              <input
                type="number"
                min={0}
                max={100}
                value={state.familyFriendDiscountPct}
                onChange={(e) =>
                  save({ familyFriendDiscountPct: Number(e.target.value) })
                }
                className="w-20 rounded-md border border-line-2 bg-canvas px-2 py-1 text-right text-fg outline-none focus:border-accent-soft"
              />
              %
            </label>
          )}
        </FlagRow>
        {msg && (
          <p className="pt-3 text-xs text-muted">{msg}</p>
        )}
      </Card>

      <Card title="Eiere (full tilgang i shop)">
        <p className="mb-3 text-xs text-muted">
          En eier omgår alle begrensningene over – bryterne gjelder ikke for
          eieren. Gi dette kun til Dawit / faktiske eiere.
        </p>
        <OwnerList users={users} />
      </Card>
    </div>
  );
}

function OwnerList({ users }: { users: OwnerUser[] }) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-muted">
        Ingen admin-/shop-brukere funnet. Opprett innlogging for en bruker først.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {users.map((u) => (
        <OwnerRow key={u.id} user={u} />
      ))}
    </ul>
  );
}

function OwnerRow({ user }: { user: OwnerUser }) {
  const [owner, setOwner] = useState(user.is_owner);
  const [pending, start] = useTransition();

  function toggle() {
    const next = !owner;
    setOwner(next);
    start(async () => {
      const r = await setUserOwner(user.id, next);
      if (r.error) setOwner(!next);
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-fg">
          {user.full_name || user.email || "Bruker"}
        </span>
        <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted uppercase">
          {user.role}
        </span>
        {user.email && (
          <span className="block text-xs text-muted">{user.email}</span>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-muted">
        {owner ? "Eier" : "Ikke eier"}
        <Toggle on={owner} onChange={toggle} disabled={pending} />
      </label>
    </li>
  );
}
