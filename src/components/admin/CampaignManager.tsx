"use client";

import { useState, useTransition } from "react";
import type { MemberCampaign } from "@/lib/campaigns-queries";
import type { MembershipTier } from "@/lib/membership-queries";
import {
  createCampaign,
  toggleCampaign,
  deleteCampaign,
} from "@/app/admin/kuponger/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

const kr = (n: number) => n.toLocaleString("nb-NO") + " kr";

function noDate(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/** Rad for én kupong: verdi, målgruppe, sesong, innløsninger + av/på/slett. */
function CampaignRow({
  c,
  tierName,
}: {
  c: MemberCampaign;
  tierName: string;
}) {
  const [pending, start] = useTransition();

  const value =
    c.discountType === "percent" ? `−${c.discountValue}%` : `−${kr(c.discountValue)}`;
  const season =
    c.startsAt || c.expiresAt
      ? `${noDate(c.startsAt) ?? "nå"} – ${noDate(c.expiresAt) ?? "uten utløp"}`
      : "Alltid";

  return (
    <div
      className={
        "border p-4 " +
        (c.active ? "border-line bg-surface" : "border-line bg-surface/40 opacity-70")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-fg">{c.name}</span>
            <span className="rounded-full bg-accent-soft/15 px-2 py-0.5 text-xs font-semibold text-accent-soft">
              {value}
            </span>
            {!c.active && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                Av
              </span>
            )}
          </div>
          {c.description && (
            <p className="mt-0.5 text-xs text-muted">{c.description}</p>
          )}
          <p className="mt-1 text-xs text-muted">
            {tierName} · {season} · {c.oncePerMember ? "én gang per medlem" : "flere ganger"}{" "}
            · {c.redemptions} innløst
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => toggleCampaign(c.id, !c.active))}
            className="text-xs font-semibold text-accent-soft hover:underline disabled:opacity-40"
          >
            {c.active ? "Slå av" : "Slå på"}
          </button>
          <ConfirmButton
            label="Slett"
            question={`Slette kupongen «${c.name}»?`}
            confirmLabel="Ja, slett"
            pendingLabel="Sletter …"
            onConfirm={() => deleteCampaign(c.id)}
          />
        </div>
      </div>
    </div>
  );
}

export function CampaignManager({
  campaigns,
  tiers,
}: {
  campaigns: MemberCampaign[];
  tiers: MembershipTier[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [pending, start] = useTransition();

  // Nivåer sortert lavest→høyest for målgruppe-valget.
  const orderedTiers = [...tiers].sort((a, b) => a.sortOrder - b.sortOrder);
  const tierNameFor = (sortOrder: number) => {
    if (sortOrder <= 0) return "Alle medlemmer";
    const t = tiers.find((x) => x.sortOrder === sortOrder);
    return t ? `${t.name}+` : "Alle medlemmer";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {campaigns.length} {campaigns.length === 1 ? "kupong" : "kuponger"}
        </p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny kupong"}
        </button>
      </div>

      {open && (
        <form
          action={(fd) =>
            start(async () => {
              await createCampaign(fd);
              setOpen(false);
              setType("percent");
            })
          }
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <label className="text-xs text-muted sm:col-span-2">
            Navn
            <input
              name="name"
              placeholder="Sommertilbud"
              required
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Beskrivelse (valgfritt — vises til kunden/kassa)
            <input
              name="description"
              placeholder="−20% på alt i august"
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <label className="text-xs text-muted">
            Rabatt-type
            <select
              name="discount_type"
              value={type}
              onChange={(e) => setType(e.target.value as "percent" | "fixed")}
              className={`mt-1 ${inputCls}`}
            >
              <option value="percent">Prosent (%)</option>
              <option value="fixed">Fast beløp (kr)</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            {type === "percent" ? "Prosent (1–100)" : "Beløp (kr)"}
            <input
              name="discount_value"
              type="number"
              min={1}
              max={type === "percent" ? 100 : undefined}
              step={type === "percent" ? 1 : 10}
              required
              className={`mt-1 ${inputCls}`}
            />
          </label>

          <label className="text-xs text-muted">
            Målgruppe (minste klubbnivå)
            <select name="min_tier_sort_order" defaultValue={0} className={`mt-1 ${inputCls}`}>
              <option value={0}>Alle medlemmer</option>
              {orderedTiers.map((t) => (
                <option key={t.id} value={t.sortOrder}>
                  {t.name} og oppover
                </option>
              ))}
            </select>
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted sm:mt-6">
            <input type="checkbox" name="once_per_member" defaultChecked className="accent-accent" />
            Kun én gang per medlem
          </label>

          <label className="text-xs text-muted">
            Gyldig fra (valgfritt)
            <input name="starts_at" type="date" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Utløper (valgfritt)
            <input name="expires_at" type="date" className={`mt-1 ${inputCls}`} />
          </label>

          <button
            type="submit"
            disabled={pending}
            className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50 sm:col-span-2"
          >
            {pending ? "Oppretter …" : "Utsted kupong"}
          </button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted">Ingen kuponger enda.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignRow key={c.id} c={c} tierName={tierNameFor(c.minTierSortOrder)} />
          ))}
        </div>
      )}
    </div>
  );
}
