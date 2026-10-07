"use client";

import { useState, useTransition } from "react";
import type { MemberCampaign } from "@/lib/campaigns-queries";
import type { MembershipTier } from "@/lib/membership-queries";
import {
  createCampaign,
  updateCampaign,
  toggleCampaign,
  deleteCampaign,
} from "@/app/admin/kuponger/actions";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Field } from "@/components/ui/Input";

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
  orderedTiers,
}: {
  c: MemberCampaign;
  tierName: string;
  orderedTiers: MembershipTier[];
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<"percent" | "fixed">(c.discountType);
  const [editPending, startEdit] = useTransition();
  const [editErr, setEditErr] = useState<string | null>(null);

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
            <Badge tone="accent">{value}</Badge>
            {!c.active && <Badge tone="neutral">Av</Badge>}
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
          <Button
            variant="link"
            type="button"
            disabled={pending}
            onClick={() => start(async () => toggleCampaign(c.id, !c.active))}
            className="text-xs font-semibold"
          >
            {c.active ? "Slå av" : "Slå på"}
          </Button>
          <Button
            variant="link"
            type="button"
            onClick={() => {
              setEditErr(null);
              setEditType(c.discountType);
              setEditing((o) => !o);
            }}
            className="text-xs font-semibold"
          >
            {editing ? "Avbryt" : "Rediger"}
          </Button>
          <ConfirmButton
            label="Slett"
            question={`Slette kupongen «${c.name}»?`}
            confirmLabel="Ja, slett"
            pendingLabel="Sletter …"
            onConfirm={() => deleteCampaign(c.id)}
          />
        </div>
      </div>

      {editing && (
        <form
          action={(fd) =>
            startEdit(async () => {
              setEditErr(null);
              const res = await updateCampaign(fd);
              if (res.error) {
                setEditErr(res.error);
                return;
              }
              setEditing(false);
            })
          }
          className="mt-4 grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <input type="hidden" name="id" value={c.id} />
          <Field label="Navn" className="sm:col-span-2">
            <Input name="name" placeholder="Sommertilbud" defaultValue={c.name} required />
          </Field>
          <Field
            label="Beskrivelse (valgfritt — vises til kunden/kassa)"
            className="sm:col-span-2"
          >
            <Input
              name="description"
              placeholder="−20% på alt i august"
              defaultValue={c.description ?? ""}
            />
          </Field>

          <Field label="Rabatt-type">
            <Select
              name="discount_type"
              value={editType}
              onChange={(e) => setEditType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">Prosent (%)</option>
              <option value="fixed">Fast beløp (kr)</option>
            </Select>
          </Field>
          <Field label={editType === "percent" ? "Prosent (1–100)" : "Beløp (kr)"}>
            <Input
              name="discount_value"
              type="number"
              min={1}
              max={editType === "percent" ? 100 : undefined}
              step={editType === "percent" ? 1 : 10}
              defaultValue={c.discountValue}
              required
            />
          </Field>

          <Field label="Målgruppe (minste klubbnivå)">
            <Select name="min_tier_sort_order" defaultValue={c.minTierSortOrder}>
              <option value={0}>Alle medlemmer</option>
              {orderedTiers.map((t) => (
                <option key={t.id} value={t.sortOrder}>
                  {t.name} og oppover
                </option>
              ))}
            </Select>
          </Field>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted sm:mt-6">
            <input
              type="checkbox"
              name="once_per_member"
              defaultChecked={c.oncePerMember}
              className="accent-accent"
            />
            Kun én gang per medlem
          </label>

          <Field label="Gyldig fra (valgfritt)">
            <Input name="starts_at" type="date" defaultValue={c.startsAt?.slice(0, 10) ?? ""} />
          </Field>
          <Field label="Utløper (valgfritt)">
            <Input name="expires_at" type="date" defaultValue={c.expiresAt?.slice(0, 10) ?? ""} />
          </Field>

          {editErr && <p className="text-sm text-danger sm:col-span-2">{editErr}</p>}
          <Button
            variant="primary"
            type="submit"
            disabled={editPending}
            className="px-4 py-2 text-sm sm:col-span-2"
          >
            {editPending ? "Lagrer …" : "Lagre endringer"}
          </Button>
        </form>
      )}
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
  const [err, setErr] = useState<string | null>(null);

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
        <Button
          variant="primary"
          onClick={() => {
            setErr(null);
            setOpen((o) => !o);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Ny kupong"}
        </Button>
      </div>

      {open && (
        <form
          action={(fd) =>
            start(async () => {
              setErr(null);
              const res = await createCampaign(fd);
              if (res.error) {
                setErr(res.error);
                return;
              }
              setOpen(false);
              setType("percent");
            })
          }
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <Field label="Navn" className="sm:col-span-2">
            <Input name="name" placeholder="Sommertilbud" required />
          </Field>
          <Field
            label="Beskrivelse (valgfritt — vises til kunden/kassa)"
            className="sm:col-span-2"
          >
            <Input name="description" placeholder="−20% på alt i august" />
          </Field>

          <Field label="Rabatt-type">
            <Select
              name="discount_type"
              value={type}
              onChange={(e) => setType(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">Prosent (%)</option>
              <option value="fixed">Fast beløp (kr)</option>
            </Select>
          </Field>
          <Field label={type === "percent" ? "Prosent (1–100)" : "Beløp (kr)"}>
            <Input
              name="discount_value"
              type="number"
              min={1}
              max={type === "percent" ? 100 : undefined}
              step={type === "percent" ? 1 : 10}
              required
            />
          </Field>

          <Field label="Målgruppe (minste klubbnivå)">
            <Select name="min_tier_sort_order" defaultValue={0}>
              <option value={0}>Alle medlemmer</option>
              {orderedTiers.map((t) => (
                <option key={t.id} value={t.sortOrder}>
                  {t.name} og oppover
                </option>
              ))}
            </Select>
          </Field>
          <label className="mt-1 flex items-center gap-2 text-xs text-muted sm:mt-6">
            <input type="checkbox" name="once_per_member" defaultChecked className="accent-accent" />
            Kun én gang per medlem
          </label>

          <Field label="Gyldig fra (valgfritt)">
            <Input name="starts_at" type="date" />
          </Field>
          <Field label="Utløper (valgfritt)">
            <Input name="expires_at" type="date" />
          </Field>

          {err && <p className="text-sm text-danger sm:col-span-2">{err}</p>}
          <Button
            variant="primary"
            type="submit"
            disabled={pending}
            className="px-4 py-2 text-sm sm:col-span-2"
          >
            {pending ? "Oppretter …" : "Utsted kupong"}
          </Button>
        </form>
      )}

      {campaigns.length === 0 ? (
        <EmptyState description="Ingen kuponger enda." />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              c={c}
              tierName={tierNameFor(c.minTierSortOrder)}
              orderedTiers={orderedTiers}
            />
          ))}
        </div>
      )}
    </div>
  );
}
