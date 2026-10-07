import { getNotices, type NoticeLevel } from "@/lib/notices-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Field } from "@/components/ui/Input";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { redirect } from "next/navigation";
import { createNotice, updateNotice, toggleNotice, deleteNotice } from "./actions";

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

/** Gjør en ISO-dato om til en datetime-local-verdi (YYYY-MM-DDTHH:mm) for prefylling. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

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

/** Validerer, oppretter og sender brukeren tilbake med ?lagret=1 / ?feil=…. */
async function createNoticeWithFeedback(formData: FormData): Promise<void> {
  "use server";
  const fail = (msg: string) =>
    redirect("/admin/meldinger?" + new URLSearchParams({ feil: msg }).toString());
  const title = String(formData.get("title") ?? "").trim();
  const starts = String(formData.get("starts_at") ?? "").trim();
  const ends = String(formData.get("ends_at") ?? "").trim();
  if (!title) fail("Meldingen må ha en tittel.");
  if (starts && ends && ends <= starts) fail("«Vises til» må være etter «Vises fra».");
  let errMsg: string | null = null;
  try {
    // createNotice returnerer i dag void; støtt { error } om den utvides.
    const r = (await createNotice(formData)) as unknown as { error?: string } | undefined;
    if (r?.error) errMsg = r.error;
  } catch {
    errMsg = "Kunne ikke opprette meldingen. Prøv igjen.";
  }
  if (errMsg) fail(errMsg);
  redirect("/admin/meldinger?lagret=1");
}

export default async function AdminMeldinger({
  searchParams,
}: {
  searchParams: Promise<{ lagret?: string; feil?: string }>;
}) {
  const [notices, sp] = await Promise.all([getNotices(), searchParams]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Driftsmeldinger"
        description="Interne beskjeder som vises som banner i admin-, kasse- og ansatt-panelene. Velg nivå, målgruppe og eventuelt en periode meldingen skal være synlig i."
      />

      {/* Ny melding */}
      {sp.lagret && (
        <p className="border border-accent-soft/40 bg-accent-soft/5 px-4 py-2 text-sm text-accent-soft">
          Meldingen er opprettet ✓
        </p>
      )}
      {sp.feil && (
        <p className="border border-danger/40 bg-danger/5 px-4 py-2 text-sm text-danger">
          {sp.feil}
        </p>
      )}

      <Card title="Ny melding">
        <form action={createNoticeWithFeedback} className="space-y-4">
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
            <SubmitButton pendingText="Oppretter …" className="act act-accent">
              Opprett melding
            </SubmitButton>
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
                      <SubmitButton pendingText="Lagrer …" className="act">
                        {n.active ? "Slå av" : "Slå på"}
                      </SubmitButton>
                    </form>
                    <form action={deleteNotice.bind(null, n.id)}>
                      <ConfirmButton
                        submit
                        label="Slett"
                        question="Slette meldingen?"
                        confirmLabel="Ja, slett"
                      />
                    </form>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-accent-soft">
                    Rediger
                  </summary>
                  <form
                    action={updateNotice}
                    className="mt-4 space-y-4 border border-line-2 bg-canvas/40 p-4"
                  >
                    <input type="hidden" name="id" value={n.id} />
                    <Field label="Tittel">
                      <Input name="title" required defaultValue={n.title} />
                    </Field>
                    <Field label="Tekst">
                      <textarea
                        name="body"
                        rows={4}
                        defaultValue={n.body ?? ""}
                        placeholder="Utfyllende beskrivelse (valgfritt) …"
                        className="w-full resize-y border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Nivå">
                        <Select name="level" defaultValue={n.level}>
                          <option value="info">Info</option>
                          <option value="warning">Viktig</option>
                          <option value="critical">Kritisk</option>
                        </Select>
                      </Field>
                      <Field label="Målgruppe">
                        <Select name="audience" defaultValue={n.audience}>
                          <option value="all">Alle</option>
                          <option value="admin">Admin</option>
                          <option value="shop">Kasse/butikk</option>
                          <option value="ansatt">Ansatt</option>
                        </Select>
                      </Field>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Vises fra" hint="(valgfritt)">
                        <Input
                          type="datetime-local"
                          name="starts_at"
                          defaultValue={toLocalInput(n.starts_at)}
                        />
                      </Field>
                      <Field label="Vises til" hint="(valgfritt)">
                        <Input
                          type="datetime-local"
                          name="ends_at"
                          defaultValue={toLocalInput(n.ends_at)}
                        />
                      </Field>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={n.active}
                        className="accent-[#F47721]"
                      />
                      Aktiv (vis meldingen nå)
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <SubmitButton pendingText="Lagrer …" className="act act-accent">
                        Lagre endringer
                      </SubmitButton>
                    </div>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
