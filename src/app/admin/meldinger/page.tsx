import { getNotices, type NoticeLevel } from "@/lib/notices-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
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

const LEVEL_BADGE: Record<NoticeLevel, string> = {
  info: "bg-surface-2 text-muted",
  warning: "bg-accent-soft/15 text-accent-soft",
  critical: "bg-danger/10 text-danger",
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
      <form action={createNotice} className="space-y-4 border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-bold">Ny melding</h2>
        <div>
          <label className="mb-1 block text-xs text-muted">Tittel</label>
          <input
            name="title"
            required
            placeholder="F.eks. Kassesystemet er nede fra kl. 12"
            className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Tekst</label>
          <textarea
            name="body"
            rows={4}
            placeholder="Utfyllende beskrivelse (valgfritt) …"
            className="w-full resize-y border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Nivå</label>
            <select
              name="level"
              defaultValue="info"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            >
              <option value="info">Info</option>
              <option value="warning">Viktig</option>
              <option value="critical">Kritisk</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Målgruppe</label>
            <select
              name="audience"
              defaultValue="all"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            >
              <option value="all">Alle</option>
              <option value="admin">Admin</option>
              <option value="shop">Kasse/butikk</option>
              <option value="ansatt">Ansatt</option>
            </select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted">
              Vises fra <span className="text-muted/70">(valgfritt)</span>
            </label>
            <input
              type="datetime-local"
              name="starts_at"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Vises til <span className="text-muted/70">(valgfritt)</span>
            </label>
            <input
              type="datetime-local"
              name="ends_at"
              className="w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            />
          </div>
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

      {/* Eksisterende meldinger */}
      <div className="border border-line bg-surface">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-bold">Eksisterende meldinger</h2>
        </div>
        {notices.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen meldinger enda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {notices.map((n) => (
              <li key={n.id} className="px-6 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={
                          "rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase " +
                          (LEVEL_BADGE[n.level] ?? LEVEL_BADGE.info)
                        }
                      >
                        {LEVEL_LABEL[n.level] ?? n.level}
                      </span>
                      <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                        {AUDIENCE_LABEL[n.audience] ?? n.audience}
                      </span>
                      {!n.active && (
                        <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                          Av
                        </span>
                      )}
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
                      <button
                        type="submit"
                        className="border border-line-2 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
                      >
                        {n.active ? "Slå av" : "Slå på"}
                      </button>
                    </form>
                    <form action={deleteNotice.bind(null, n.id)}>
                      <button
                        type="submit"
                        className="border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                      >
                        Slett
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
