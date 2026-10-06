"use client";

import { useState, useTransition } from "react";
import type { MembershipTier, MembershipCount } from "@/lib/membership-queries";
import { TierBadge } from "@/components/membership/TierBadge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Card } from "@/components/ui/Card";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { saveTier, addTier, deleteTier, moveTier } from "@/app/admin/kundeklubb/actions";

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
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <TierBadge name={tier.name} color={tier.color} />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {count} {count === 1 ? "kunde" : "kunder"}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="subtle"
              type="button"
              aria-label="Flytt opp (høyere nivå)"
              disabled={isTop || pending}
              onClick={() => move("up")}
              className="px-2 py-1 text-xs"
            >
              ↑
            </Button>
            <Button
              variant="subtle"
              type="button"
              aria-label="Flytt ned (lavere nivå)"
              disabled={isBottom || pending}
              onClick={() => move("down")}
              className="px-2 py-1 text-xs"
            >
              ↓
            </Button>
          </div>
        </div>
      </div>

      <form action={saveTier} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={tier.id} />
        <Field label="Navn">
          <Input name="name" defaultValue={tier.name} />
        </Field>
        <Field label="Farge (hex)">
          <Input name="color" defaultValue={tier.color ?? ""} placeholder="#E5E4E2" />
        </Field>
        <Field label="Min. forbruk (kr, livstid)">
          <Input
            name="min_spend"
            type="number"
            min={0}
            step={100}
            defaultValue={tier.minSpend}
          />
        </Field>
        <Field label="Min. fullførte besøk">
          <Input
            name="min_visits"
            type="number"
            min={0}
            step={1}
            defaultValue={tier.minVisits}
          />
        </Field>
        <Field label="Medlemsgode" className="sm:col-span-2">
          <Input
            name="benefit"
            defaultValue={tier.benefit ?? ""}
            placeholder="Fritekst — vises til kunden på «min side»"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
          <Button type="submit" className="px-4 py-2 text-sm">
            Lagre nivå
          </Button>
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
    </Card>
  );
}

/** Skjema for å legge til et nytt nivå (blir nytt toppnivå; kan omordnes). */
function AddTierForm() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

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
              setErr(null);
              const res = await addTier(fd);
              if (res.error) setErr(res.error);
              else setOpen(false);
            })
          }
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <p className="text-sm font-semibold text-fg sm:col-span-2">Nytt nivå</p>
          <Field label="Navn">
            <Input name="name" placeholder="Platinum" required />
          </Field>
          <Field label="Farge (hex)">
            <Input name="color" placeholder="#E5E4E2" />
          </Field>
          <Field label="Min. forbruk (kr, livstid)">
            <Input name="min_spend" type="number" min={0} step={100} defaultValue={0} />
          </Field>
          <Field label="Min. fullførte besøk">
            <Input name="min_visits" type="number" min={0} step={1} defaultValue={0} />
          </Field>
          <Field label="Medlemsgode" className="sm:col-span-2">
            <Input
              name="benefit"
              placeholder="Fritekst — vises til kunden på «min side»"
            />
          </Field>
          {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending} className="px-4 py-2 text-sm">
              {pending ? "Legger til …" : "Legg til nivå"}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setErr(null);
                setOpen(false);
              }}
              className="text-xs"
            >
              Avbryt
            </Button>
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
