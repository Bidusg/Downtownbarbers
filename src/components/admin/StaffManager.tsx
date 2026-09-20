"use client";

import { useState, useTransition } from "react";
import type { AdminStaff } from "@/lib/admin-queries";
import { FileInput } from "@/components/ui/FileInput";
import {
  createStaff,
  toggleStaff,
  setStaffPin,
  setStaffPostnummer,
  createStaffLogin,
  resendStaffPassword,
} from "@/app/admin/ansatte/actions";

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
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    start(async () => {
      setMsg(null);
      setErr(false);
      const r = await fn();
      if (r.ok) {
        setMsg("Passord sendt på e-post ✓");
      } else {
        setErr(true);
        setMsg(r.error);
      }
    });

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
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
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
          <input name="title" placeholder="Tittel (Barber / Master / Lærling)" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
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
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
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
                    <span className="font-medium text-fg">{s.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{s.employee_number ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{s.title ?? "—"}</td>
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
