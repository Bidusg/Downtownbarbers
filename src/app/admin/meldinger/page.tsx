import { getNotices, type NoticeLevel } from "@/lib/notices-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Field } from "@/components/ui/Input";
import { createNotice, toggleNotice, deleteNotice } from "./actions";

export const dynamic = "force-dynamic";

const LEVEL_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Viktig",
  critical: "Kritisk",
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Alle",
  admin: "Admin",
  shop: "Kasse/butikk",
  ansatt: "Ansatt",
};

const LEVEL_TONE: Record<NoticeLevel, BadgeTone> = {
  info: "neutral",
  warning: "accent",
  critical: "danger",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default async function AdminMeldinger() {
  const notices = await getNotices();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Driftsmeldinger"
        description="Interne beskjeder som vises som banner i admin-, kasse- og ansatt-panelene. Velg nivå, målgruppe og eventuelt en periode meldingen skal være synlig i."
      />

      {/* Ny melding */}
      <Card title="Ny melding">
        <form action={createNotice} className="space-y-4">
          <Field label="Tittel">
            <Input
              name="title"
              required
              placeholder="F.eks. Kassesystemet er nede fra kl. 12"
            />
          </Field>
          <Field label="Tekst">
            <textarea
              name="body"
              rows={4}
              placeholder="Utfyllende beskrivelse (valgfritt) …"
              className="w-full resize-y border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nivå">
              <Select name="level" defaultValue="info">
                <option value="info">Info</option>
                <option value="warning">Viktig</option>
                <option value="critical">Kritisk</option>
              </Select>
            </Field>
            <Field label="Målgruppe">
              <Select name="audience" defaultValue="all">
                <option value="all">Alle</option>
                <option value="admin">Admin</option>
                <option value="shop">Kasse/butikk</option>
                <option value="ansatt">Ansatt</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vises fra" hint="(valgfritt)">
              <Input type="datetime-local" name="starts_at" />
            </Field>
            <Field label="Vises til" hint="(valgfritt)">
              <Input type="datetime-local" name="ends_at" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <input
              type="checkbox"
              name="active"
              defaultChecked
              className="accent-[#F47721]"
            />
            Aktiv (vis meldingen nå)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" className="px-5 py-2 text-sm">
              Opprett melding
            </Button>
            <span className="text-xs text-muted">
              Tom «fra/til» betyr uten start/slutt.
            </span>
          </div>
        </form>
      </Card>

      {/* Eksisterende meldinger */}
      <Card title="Eksisterende meldinger" padded={false}>
        {notices.length === 0 ? (
          <div className="p-6">
            <EmptyState description="Ingen meldinger enda." />
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {notices.map((n) => (
              <li key={n.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={LEVEL_TONE[n.level] ?? "neutral"}>
                        {LEVEL_LABEL[n.level] ?? n.level}
                      </Badge>
                      <Badge tone="neutral">
                        {AUDIENCE_LABEL[n.audience] ?? n.audience}
                      </Badge>
                      {!n.active && <Badge tone="neutral">Av</Badge>}
                    </div>
                    <p className="mt-2 font-medium text-fg">{n.title}</p>
                    {n.body && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted">
                      Fra {fmt(n.starts_at)} · Til {fmt(n.ends_at)} · Opprettet{" "}
                      {fmt(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <form action={toggleNotice.bind(null, n.id, !n.active)}>
                      <Button
                        variant="subtle"
                        type="submit"
                        className="px-3 py-1.5 text-xs"
                      >
                        {n.active ? "Slå av" : "Slå på"}
                      </Button>
                    </form>
                    <form action={deleteNotice.bind(null, n.id)}>
                      <Button
                        variant="danger"
                        type="submit"
                        className="px-3 py-1.5 text-xs"
                      >
                        Slett
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
