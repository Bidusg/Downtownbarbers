"use client";

import { useState, useTransition } from "react";
import type { MembershipTier, MembershipCount } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { saveTier, addTier, deleteTier, moveTier } from "@/app/admin/kundeklubb/actions";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO");

/** Ett redigerbart nivå-kort: navn, farge, terskler, gode + omordne/slett. */
function TierCard({
  tier,
  count,
  isTop,
  isBottom,
  onlyOne,
}: {
  tier: MembershipTier;
  count: number;
  isTop: boolean;
  isBottom: boolean;
  onlyOne: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const move = (dir: "up" | "down") =>
    start(async () => {
      setErr(null);
      const r = await moveTier(tier.id, dir);
      if (!r.ok) setErr(r.error ?? "Kunne ikke omordne");
    });

  return (
    <div className="border border-line bg-surface p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <TierBadge name={tier.name} color={tier.color} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {count} {count === 1 ? "kunde" : "kunder"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Flytt opp (høyere nivå)"
              disabled={isTop || pending}
              onClick={() => move("up")}
              className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Flytt ned (lavere nivå)"
              disabled={isBottom || pending}
              onClick={() => move("down")}
              className="border border-line-2 px-2 py-1 text-xs text-muted transition-colors hover:text-fg disabled:opacity-30"
            >
              ↓
            </button>
          </div>
        </div>
      </div>

      <form action={saveTier} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={tier.id} />
        <label className="text-xs text-muted">
          Navn
          <input name="name" defaultValue={tier.name} className={`mt-1 ${inputCls}`} />
        </label>
        <label className="text-xs text-muted">
          Farge (hex)
          <input
            name="color"
            defaultValue={tier.color ?? ""}
            placeholder="#E5E4E2"
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted">
          Min. forbruk (kr, livstid)
          <input
            name="min_spend"
            type="number"
            min={0}
            step={100}
            defaultValue={tier.minSpend}
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted">
          Min. fullførte besøk
          <input
            name="min_visits"
            type="number"
            min={0}
            step={1}
            defaultValue={tier.minVisits}
            className={`mt-1 ${inputCls}`}
          />
        </label>
        <label className="text-xs text-muted sm:col-span-2">
          Medlemsgode
          <input
            name="benefit"
            defaultValue={tier.benefit ?? ""}
            placeholder="Fritekst — vises til kunden på «min side»"
            className={`mt-1 ${inputCls}`}
          />
        </label>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <button
            type="submit"
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90"
          >
            Lagre nivå
          </button>
          <span className="text-xs text-muted">
            Terskel: {kr(tier.minSpend)} kr eller {tier.minVisits} besøk
          </span>
          {!onlyOne && (
            <span className="ml-auto">
              <ConfirmButton
                label="Slett nivå"
                question={`Slette nivået «${tier.name}»?`}
                confirmLabel="Ja, slett"
                pendingLabel="Sletter …"
                onConfirm={() => deleteTier(tier.id)}
              />
            </span>
          )}
        </div>
      </form>

      {err && <p className="mt-2 text-xs text-danger">{err}</p>}
    </div>
  );
}

/** Skjema for å legge til et nytt nivå (blir nytt toppnivå; kan omordnes). */
function AddTierForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border border-dashed border-line-2 px-4 py-2 text-sm font-semibold text-accent-soft transition-colors hover:border-accent-soft"
        >
          + Nytt nivå (f.eks. Platinum)
        </button>
      ) : (
        <form
          action={(fd) =>
            start(async () => {
              await addTier(fd);
              setOpen(false);
            })
          }
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <p className="text-sm font-semibold text-fg sm:col-span-2">Nytt nivå</p>
          <label className="text-xs text-muted">
            Navn
            <input name="name" placeholder="Platinum" required className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Farge (hex)
            <input name="color" placeholder="#E5E4E2" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Min. forbruk (kr, livstid)
            <input
              name="min_spend"
              type="number"
              min={0}
              step={100}
              defaultValue={0}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted">
            Min. fullførte besøk
            <input
              name="min_visits"
              type="number"
              min={0}
              step={1}
              defaultValue={0}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Medlemsgode
            <input
              name="benefit"
              placeholder="Fritekst — vises til kunden på «min side»"
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Legger til …" : "Legg til nivå"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted transition-colors hover:text-fg"
            >
              Avbryt
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/**
 * Datadrevet nivå-editor for kundeklubben. Nivåene vises høyest først
 * (toppnivået øverst). Admin kan redigere, omordne (↑/↓), slette og legge til
 * nye nivåer — uten kodeendring.
 */
export function MembershipTiersEditor({
  tiers,
  counts,
}: {
  tiers: MembershipTier[];
  counts: MembershipCount[];
}) {
  // Vis høyest først (synkende sort_order) — som en «rangstige».
  const ordered = [...tiers].sort((a, b) => b.sortOrder - a.sortOrder || b.id - a.id);
  const countFor = (id: number) => counts.find((c) => c.tierId === id)?.count ?? 0;
  const onlyOne = ordered.length <= 1;

  return (
    <div className="space-y-4">
      {ordered.map((t, i) => (
        <TierCard
          key={t.id}
          tier={t}
          count={countFor(t.id)}
          isTop={i === 0}
          isBottom={i === ordered.length - 1}
          onlyOne={onlyOne}
        />
      ))}
      <AddTierForm />
    </div>
  );
}
