"use client";

import { useState, useTransition } from "react";
import type { AdminStaff } from "@/lib/admin-queries";
import { FileInput } from "@/components/ui/FileInput";
import { STAFF_LEVELS, LEVEL_LABEL, asStaffLevel } from "@/lib/levels";
import {
  createStaff,
  updateStaff,
  toggleStaff,
  setStaffPin,
  setStaffPostnummer,
  createStaffLogin,
  resendStaffPassword,
} from "@/app/admin/ansatte/actions";

const editInputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft";

/** Rediger-modal for én ansatt: navn, e-post, tittel, ansattnr. */
function EditStaffModal({
  staff,
  onClose,
}: {
  staff: AdminStaff;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(staff.full_name);
  const [email, setEmail] = useState(staff.email ?? "");
  const [title, setTitle] = useState(staff.title ?? "");
  const [level, setLevel] = useState(asStaffLevel(staff.level));
  const [empNo, setEmpNo] = useState(staff.employee_number ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setErr(null);
    start(async () => {
      const r = await updateStaff(staff.id, {
        full_name: fullName,
        email,
        title,
        level,
        employee_number: empNo,
      });
      if (r.error) setErr(r.error);
      else onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-line bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-fg">
            Rediger ansatt
          </h3>
          <button
            onClick={onClose}
            aria-label="Lukk"
            className="text-2xl leading-none text-muted hover:text-fg"
          >
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Fullt navn</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={editInputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              E-post <span className="text-muted">(kreves for innlogging)</span>
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              inputMode="email"
              placeholder="navn@epost.no"
              className={editInputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Tittel</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barber / Master / Lærling" className={editInputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              Nivå <span className="text-muted">(styrer pris/varighet)</span>
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(asStaffLevel(e.target.value))}
              className={editInputCls}
            >
              {STAFF_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Ansattnr</label>
            <input value={empNo} onChange={(e) => setEmpNo(e.target.value)} placeholder="DB-007" className={editInputCls} />
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={save}
              disabled={pending}
              className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
            >
              {pending ? "Lagrer …" : "Lagre"}
            </button>
            <button onClick={onClose} className="text-sm text-muted hover:text-fg">
              Avbryt
            </button>
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
        <button
          type="button"
          onClick={copyPw}
          className="text-accent-soft hover:underline"
        >
          {copied ? "Kopiert ✓" : "Kopier"}
        </button>
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
          <span className="rounded-full bg-accent-soft/15 px-2 py-0.5 text-[10px] font-semibold text-accent-soft">
            Har innlogging ✓
          </span>
          <button
            onClick={() => run(() => resendStaffPassword(id))}
            disabled={pending}
            className="text-xs text-accent-soft hover:underline disabled:opacity-40"
          >
            {pending ? "Sender …" : "Send nytt passord"}
          </button>
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
      <button
        onClick={() => run(() => createStaffLogin(id))}
        disabled={pending || !email}
        title={email ? undefined : "Ansatt mangler e-post"}
        className="w-fit bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-40"
      >
        {pending ? "Oppretter …" : "Opprett innlogging"}
      </button>
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
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (hasPin ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
          }
        >
          {hasPin ? "PIN satt ✓" : "Ikke satt"}
        </span>
        <button
          onClick={() => { setOpen(true); setMsg(null); }}
          className="text-xs text-accent-soft hover:underline"
        >
          {hasPin ? "Nullstill" : "Sett PIN"}
        </button>
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
      <button
        onClick={() =>
          start(async () => {
            const r = await setStaffPin(id, pin);
            if (r.error) setMsg(r.error);
            else { setMsg("Lagret ✓"); setPin(""); setTimeout(() => setOpen(false), 900); }
          })
        }
        disabled={pending || pin.length !== 4}
        className="bg-accent px-2 py-1 text-xs font-semibold text-accent-fg disabled:opacity-40"
      >
        Lagre
      </button>
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
        <span
          className={
            "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
            (postnummer
              ? "bg-accent-soft/15 text-accent-soft"
              : "bg-surface-2 text-muted")
          }
        >
          {postnummer ? postnummer : "Mangler"}
        </span>
        <button
          onClick={() => {
            setOpen(true);
            setMsg(null);
            setErr(false);
          }}
          className="text-xs text-accent-soft hover:underline"
        >
          {postnummer ? "Endre" : "Sett"}
        </button>
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
      <button
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
        className="bg-accent px-2 py-1 text-xs font-semibold text-accent-fg disabled:opacity-40"
      >
        Lagre
      </button>
      {msg && (
        <span className={"text-xs " + (err ? "text-danger" : "text-muted")}>
          {msg}
        </span>
      )}
    </div>
  );
}

export function StaffManager({ staff }: { staff: AdminStaff[] }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminStaff | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      {editing && (
        <EditStaffModal staff={editing} onClose={() => setEditing(null)} />
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{staff.length} ansatte</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Ny ansatt"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createStaff(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <input name="employee_number" placeholder="Ansattnr (f.eks. DB-007)" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="full_name" placeholder="Fullt navn" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="email" type="email" inputMode="email" placeholder="E-post (for innlogging)" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="title" placeholder="Tittel (Barber / Master / Lærling)" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <select name="level" defaultValue="barber" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" title="Nivå (styrer pris/varighet)">
            {STAFF_LEVELS.map((l) => (
              <option key={l} value={l}>
                Nivå: {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
          <input name="bio" placeholder="Kort bio" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="postnummer" placeholder="Postnummer (passord til lønnslipp-ZIP)" inputMode="numeric" maxLength={4} pattern="\d{4}" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <div className="text-xs text-muted">
            Bilde
            <FileInput name="photo" accept="image/*" buttonLabel="Velg bilde" />
          </div>
          <div className="text-xs text-muted">
            Kontrakt (PDF)
            <FileInput name="contract" accept="application/pdf" buttonLabel="Velg PDF" />
          </div>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2">
            Lagre ansatt
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Ansatt</th>
              <th className="px-4 py-3">Ansattnr</th>
              <th className="px-4 py-3">Tittel</th>
              <th className="px-4 py-3">Nivå</th>
              <th className="px-4 py-3">Kontrakt</th>
              <th className="px-4 py-3">Innlogging</th>
              <th className="px-4 py-3">Stemplings-PIN</th>
              <th className="px-4 py-3">Postnummer</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-muted">
                  Ingen ansatte enda – koble til Supabase eller legg til den første.
                </td>
              </tr>
            )}
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center bg-surface-2 font-display text-sm font-bold text-fg">
                      {s.full_name.charAt(0)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-fg">{s.full_name}</span>
                        <button
                          onClick={() => setEditing(s)}
                          className="text-xs text-accent-soft hover:underline"
                        >
                          Rediger
                        </button>
                      </div>
                      <span
                        className={
                          "block text-xs " +
                          (s.email ? "text-muted" : "text-danger")
                        }
                      >
                        {s.email ?? "Mangler e-post"}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{s.employee_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{s.title ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-fg-soft">
                    {LEVEL_LABEL[asStaffLevel(s.level)]}
                  </span>
                </td>
                <td className="px-4 py-3">
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
                </td>
                <td className="px-4 py-3">
                  <LoginCell
                    id={s.id}
                    hasLogin={s.profile_id != null}
                    email={s.email}
                  />
                </td>
                <td className="px-4 py-3">
                  <PinCell id={s.id} hasPin={s.has_pin} />
                </td>
                <td className="px-4 py-3">
                  <PostnummerCell id={s.id} postnummer={s.postnummer} />
                </td>
                <td className="px-4 py-3">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
