"use client";

import { useState, useTransition } from "react";
import type { AdminStaff } from "@/lib/admin-queries";
import type { StaffLevel, PickerService } from "@/lib/levels-queries";
import { FileInput } from "@/components/ui/FileInput";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  createStaff,
  updateStaff,
  toggleStaff,
  setStaffPin,
  setStaffPostnummer,
  setStaffLevel,
  setStaffServices,
  createStaffLogin,
  resendStaffPassword,
} from "@/app/admin/ansatte/actions";

/** Rediger-modal for én ansatt: navn, e-post, tittel, ansattnr, nivå + tjenester. */
function EditStaffModal({
  staff,
  levels,
  services,
  currentServiceIds,
  onClose,
}: {
  staff: AdminStaff;
  levels: StaffLevel[];
  services: PickerService[];
  currentServiceIds: string[];
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(staff.full_name);
  const [email, setEmail] = useState(staff.email ?? "");
  const [title, setTitle] = useState(staff.title ?? "");
  const [empNo, setEmpNo] = useState(staff.employee_number ?? "");
  const [levelId, setLevelId] = useState(staff.level_id ?? "");
  // Tomt sett fra før = leverer alt (ny ansatt). Da starter vi med alt huket av
  // så et lagret valg ikke utilsiktet tømmer tilbudet.
  const [serviceIds, setServiceIds] = useState<Set<string>>(
    () =>
      new Set(
        currentServiceIds.length > 0
          ? currentServiceIds
          : services.map((s) => s.id),
      ),
  );
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleService = (id: string) =>
    setServiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Grupper tjenester etter kategori.
  const groups: { cat: string; rows: PickerService[] }[] = [];
  for (const s of services) {
    let g = groups.find((x) => x.cat === s.categoryName);
    if (!g) {
      g = { cat: s.categoryName, rows: [] };
      groups.push(g);
    }
    g.rows.push(s);
  }

  function save() {
    setErr(null);
    start(async () => {
      const r = await updateStaff(staff.id, {
        full_name: fullName,
        email,
        title,
        employee_number: empNo,
      });
      if (r.error) {
        setErr(r.error);
        return;
      }
      const lr = await setStaffLevel(staff.id, levelId || null);
      if (lr.error) {
        setErr(lr.error);
        return;
      }
      const sr = await setStaffServices(staff.id, Array.from(serviceIds));
      if (sr.error) {
        setErr(sr.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-fg">
            Rediger ansatt
          </h3>
          <Button
            variant="ghost"
            onClick={onClose}
            aria-label="Lukk"
            className="text-2xl leading-none"
          >
            ×
          </Button>
        </div>
        <div className="space-y-3">
          <Field label="Fullt navn">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="E-post" hint="(kreves for innlogging)">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              placeholder="navn@epost.no"
            />
          </Field>
          <Field label="Tittel">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barber / Master / Lærling" />
          </Field>
          <Field label="Ansattnr">
            <Input value={empNo} onChange={(e) => setEmpNo(e.target.value)} placeholder="DB-007" />
          </Field>

          <Field label="Nivå" hint="(styrer prisen kunden ser)">
            <Select
              value={levelId}
              onChange={(e) => setLevelId(e.target.value)}
            >
              <option value="">Uten nivå (basispris)</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs text-muted">
                Tjenester denne leverer
              </label>
              <div className="flex gap-2 text-xs">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setServiceIds(new Set(services.map((s) => s.id)))}
                >
                  Alle
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setServiceIds(new Set())}
                  className="hover:underline"
                >
                  Ingen
                </Button>
              </div>
            </div>
            <div className="max-h-56 space-y-3 overflow-y-auto border border-line-2 bg-canvas p-3">
              {services.length === 0 && (
                <p className="text-xs text-muted">Ingen aktive tjenester.</p>
              )}
              {groups.map((g) => (
                <div key={g.cat}>
                  <p className="mb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
                    {g.cat}
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {g.rows.map((s) => (
                      <label
                        key={s.id}
                        className="flex items-center gap-2 text-sm text-fg"
                      >
                        <input
                          type="checkbox"
                          checked={serviceIds.has(s.id)}
                          onChange={() => toggleService(s.id)}
                          className="accent-accent"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">
              Ingen avhukede = leverer alt (standard for ny ansatt).
            </p>
          </div>

          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              onClick={save}
              disabled={pending}
              className="px-4 py-2 text-sm"
            >
              {pending ? "Lagrer …" : "Lagre"}
            </Button>
            <Button variant="ghost" onClick={onClose} className="text-sm">
              Avbryt
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginCell({
  id,
  hasLogin,
  email,
}: {
  id: string;
  hasLogin: boolean;
  email: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [creds, setCreds] = useState<{ email?: string; pw: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const run = (
    fn: () => Promise<
      | { ok: true; tempPassword?: string; email?: string }
      | { ok: false; error: string }
    >,
  ) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      setCreds(null);
      setCopied(false);
      const r = await fn();
      if (r.ok) {
        setMsg("Passord sendt på e-post ✓");
        if (r.tempPassword) setCreds({ email: r.email, pw: r.tempPassword });
      } else {
        setErr(true);
        setMsg(r.error);
      }
    });

  const copyPw = () => {
    if (!creds) return;
    navigator.clipboard?.writeText(creds.pw).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  const credsBox = creds ? (
    <div className="mt-1 rounded-md border border-accent-soft/40 bg-accent-soft/10 p-2 text-xs">
      <p className="mb-1 font-semibold text-fg">Midlertidig passord</p>
      {creds.email && (
        <p className="text-muted">
          E-post: <span className="text-fg">{creds.email}</span>
        </p>
      )}
      <div className="mt-1 flex items-center gap-2">
        <code className="rounded bg-canvas px-2 py-1 font-mono text-sm text-fg select-all">
          {creds.pw}
        </code>
        <Button
          type="button"
          variant="link"
          onClick={copyPw}
        >
          {copied ? "Kopiert ✓" : "Kopier"}
        </Button>
      </div>
      <p className="mt-1 text-muted">
        Gi dette til den ansatte. De logger inn på /logg-inn og bør bytte passord.
      </p>
    </div>
  ) : null;

  if (hasLogin) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge tone="accent">Har innlogging ✓</Badge>
          <Button
            variant="link"
            onClick={() => run(() => resendStaffPassword(id))}
            disabled={pending}
            className="text-xs"
          >
            {pending ? "Sender …" : "Send nytt passord"}
          </Button>
        </div>
        {msg && (
          <span className={"text-xs " + (err ? "text-danger" : "text-muted")}>
            {msg}
          </span>
        )}
        {credsBox}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="primary"
        onClick={() => run(() => createStaffLogin(id))}
        disabled={pending || !email}
        title={email ? undefined : "Ansatt mangler e-post"}
        className="w-fit px-2.5 py-1 text-xs"
      >
        {pending ? "Oppretter …" : "Opprett innlogging"}
      </Button>
      {!email && (
        <span className="text-xs text-muted">Mangler e-post</span>
      )}
      {msg && (
        <span className={"text-xs " + (err ? "text-danger" : "text-muted")}>
          {msg}
        </span>
      )}
      {credsBox}
    </div>
  );
}

function PinCell({ id, hasPin }: { id: string; hasPin: boolean }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone={hasPin ? "accent" : "neutral"}>
          {hasPin ? "PIN satt ✓" : "Ikke satt"}
        </Badge>
        <Button
          variant="link"
          onClick={() => { setOpen(true); setMsg(null); }}
          className="text-xs"
        >
          {hasPin ? "Nullstill" : "Sett PIN"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="4 siffer"
        className="w-20 border border-line-2 bg-canvas px-2 py-1 text-xs outline-none focus:border-accent-soft"
      />
      <Button
        variant="primary"
        onClick={() =>
          start(async () => {
            const r = await setStaffPin(id, pin);
            if (r.error) setMsg(r.error);
            else { setMsg("Lagret ✓"); setPin(""); setTimeout(() => setOpen(false), 900); }
          })
        }
        disabled={pending || pin.length !== 4}
        className="px-2 py-1 text-xs"
      >
        Lagre
      </Button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}

function PostnummerCell({
  id,
  postnummer,
}: {
  id: string;
  postnummer: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(postnummer ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Badge tone={postnummer ? "accent" : "neutral"}>
          {postnummer ? postnummer : "Mangler"}
        </Badge>
        <Button
          variant="link"
          onClick={() => {
            setOpen(true);
            setMsg(null);
            setErr(false);
          }}
          className="text-xs"
        >
          {postnummer ? "Endre" : "Sett"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        placeholder="4 siffer"
        className="w-20 border border-line-2 bg-canvas px-2 py-1 text-xs outline-none focus:border-accent-soft"
      />
      <Button
        variant="primary"
        onClick={() =>
          start(async () => {
            setMsg(null);
            setErr(false);
            const r = await setStaffPostnummer(id, value);
            if (r.error) {
              setErr(true);
              setMsg(r.error);
            } else {
              setMsg("Lagret ✓");
              setTimeout(() => setOpen(false), 900);
            }
          })
        }
        disabled={pending || (value.length > 0 && value.length !== 4)}
        className="px-2 py-1 text-xs"
      >
        Lagre
      </Button>
      {msg && (
        <span className={"text-xs " + (err ? "text-danger" : "text-muted")}>
          {msg}
        </span>
      )}
    </div>
  );
}

export function StaffManager({
  staff,
  levels = [],
  services = [],
  staffServices = {},
}: {
  staff: AdminStaff[];
  levels?: StaffLevel[];
  services?: PickerService[];
  /** staff_id → service_id[] */
  staffServices?: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStaff | null>(null);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const levelName = (id: string | null) =>
    id ? (levels.find((l) => l.id === id)?.name ?? null) : null;

  const activeStaff = staff.filter((s) => s.active);
  const inactiveStaff = staff.filter((s) => !s.active);

  const renderRow = (s: AdminStaff) => (
    <Tr key={s.id}>
      <Td>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center bg-surface-2 font-display text-sm font-bold text-fg">
            {s.full_name.charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-fg">{s.full_name}</span>
              <Button
                variant="link"
                onClick={() => setEditing(s)}
                className="text-xs"
              >
                Rediger
              </Button>
            </div>
            <span
              className={
                "block text-xs " + (s.email ? "text-muted" : "text-danger")
              }
            >
              {s.email ?? "Mangler e-post"}
            </span>
          </div>
        </div>
      </Td>
      <Td muted>{s.employee_number ?? "—"}</Td>
      <Td muted>{s.title ?? "—"}</Td>
      <Td>
        {levelName(s.level_id) ? (
          <Badge tone="accent">{levelName(s.level_id)}</Badge>
        ) : (
          <span className="text-xs text-muted">—</span>
        )}
      </Td>
      <Td>
        <div className="flex flex-col gap-0.5">
          {s.contract_url && (
            <a href={s.contract_url} target="_blank" className="text-xs text-danger hover:underline">
              Åpne (offentlig)
            </a>
          )}
          <a href={`/admin/ansattdokumenter?staff=${s.id}`} className="text-xs text-accent-soft hover:underline">
            Dokumenter
          </a>
        </div>
      </Td>
      <Td>
        <LoginCell id={s.id} hasLogin={s.profile_id != null} email={s.email} />
      </Td>
      <Td>
        <PinCell id={s.id} hasPin={s.has_pin} />
      </Td>
      <Td>
        <PostnummerCell id={s.id} postnummer={s.postnummer} />
      </Td>
      <Td>
        <button
          onClick={() => start(() => toggleStaff(s.id, !s.active))}
          disabled={pending}
          className={
            "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
            (s.active ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
          }
        >
          {s.active ? "Aktiv" : "Inaktiv"}
        </button>
      </Td>
    </Tr>
  );

  const headRow = (
    <Tr head>
      <Th>Ansatt</Th>
      <Th>Ansattnr</Th>
      <Th>Tittel</Th>
      <Th>Nivå</Th>
      <Th>Kontrakt</Th>
      <Th>Innlogging</Th>
      <Th>Stemplings-PIN</Th>
      <Th>Postnummer</Th>
      <Th>Status</Th>
    </Tr>
  );

  return (
    <div className="space-y-6">
      {editing && (
        <EditStaffModal
          staff={editing}
          levels={levels}
          services={services}
          currentServiceIds={staffServices[editing.id] ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {activeStaff.length} aktive ansatte
          {inactiveStaff.length > 0 && ` · ${inactiveStaff.length} inaktive`}
        </p>
        <Button
          variant="primary"
          onClick={() => {
            setCreateErr(null);
            setOpen((o) => !o);
          }}
          className="px-4 py-2 text-sm"
        >
          {open ? "Lukk" : "+ Ny ansatt"}
        </Button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            const res = await createStaff(fd);
            if (res?.ok) {
              setCreateErr(null);
              setOpen(false);
            } else {
              setCreateErr(res?.error ?? "Noe gikk galt. Prøv igjen.");
            }
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          {createErr && (
            <p
              role="alert"
              className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger sm:col-span-2"
            >
              {createErr}
            </p>
          )}
          <Input name="employee_number" placeholder="Ansattnr (f.eks. DB-007)" required />
          <Input name="full_name" placeholder="Fullt navn" required />
          <Input name="email" type="email" inputMode="email" placeholder="E-post (for innlogging)" />
          <Input name="title" placeholder="Tittel (Barber / Master / Lærling)" />
          <Input name="bio" placeholder="Kort bio" />
          <Input name="postnummer" placeholder="Postnummer (passord til lønnsoversikt-ZIP)" inputMode="numeric" maxLength={4} pattern="\d{4}" />
          <div className="text-xs text-muted">
            Bilde
            <FileInput name="photo" accept="image/*" buttonLabel="Velg bilde" />
          </div>
          <div className="text-xs text-muted">
            Kontrakt (PDF)
            <FileInput name="contract" accept="application/pdf" buttonLabel="Velg PDF" />
          </div>
          <Button variant="primary" type="submit" className="px-4 py-2 text-sm sm:col-span-2">
            Lagre ansatt
          </Button>
        </form>
      )}

      <Card padded={false}>
        <Table>
          <THead>{headRow}</THead>
          <TBody>
            {activeStaff.length === 0 && (
              <TableEmpty colSpan={9}>
                Ingen aktive ansatte – legg til den første.
              </TableEmpty>
            )}
            {activeStaff.map(renderRow)}
          </TBody>
        </Table>
      </Card>

      {inactiveStaff.length > 0 && (
        <details className="border border-line bg-surface">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-fg-soft hover:text-fg">
            Inaktive ansatte ({inactiveStaff.length})
            <span className="ml-2 text-xs font-normal text-muted">— klikk for å vise</span>
          </summary>
          <Table>
            <THead>{headRow}</THead>
            <TBody>{inactiveStaff.map(renderRow)}</TBody>
          </Table>
        </details>
      )}
    </div>
  );
}
