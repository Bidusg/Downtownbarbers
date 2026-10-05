"use client";

import { useActionState, useState } from "react";
import { createUser, deleteUser, type CreateUserResult } from "@/app/admin/brukere/actions";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const ROLE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "full tilgang" },
  { value: "eier", label: "Eier", hint: "full tilgang, ingen shop-begrensninger" },
  { value: "shop", label: "Kasse", hint: "skranke og kalender" },
  { value: "revisor", label: "Revisor", hint: "regnskap/eksport" },
  { value: "staff", label: "Ansatt", hint: "kun eget" },
];

/** Opprett ny innlogging med rolle – passordet vises én gang + sendes på e-post. */
export function CreateUserForm() {
  const [state, action, pending] = useActionState<CreateUserResult | null, FormData>(
    createUser,
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Ny bruker</h2>
          <p className="text-xs text-muted">
            Én innlogging per person. Deler to personer samme konto, logger den
            ene den andre ut (Supabase roterer innloggingsnøkkelen).
          </p>
        </div>
        <Button type="button" variant={open ? "subtle" : "primary"} onClick={() => setOpen((o) => !o)}>
          {open ? "Lukk" : "+ Opprett bruker"}
        </Button>
      </div>

      {open && (
        <form action={action} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
          <Field label="E-post">
            <Input name="email" type="email" required autoComplete="off" placeholder="navn@downtownbarbers.no" />
          </Field>
          <Field label="Navn (valgfritt)">
            <Input name="full_name" placeholder="Fornavn Etternavn" />
          </Field>
          <Field label="Rolle">
            <Select name="role" defaultValue="shop">
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label} – {r.hint}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Oppretter …" : "Opprett"}
          </Button>
          {state && !state.ok && (
            <p className="text-sm text-danger sm:col-span-4">{state.error}</p>
          )}
          {state && state.ok && (
            <div className="rounded-md border border-accent-soft/40 bg-accent-soft/10 p-3 text-sm sm:col-span-4">
              <p className="font-semibold text-fg">Bruker opprettet: {state.email}</p>
              <p className="mt-1 text-muted">
                Midlertidig passord (vises bare nå):{" "}
                <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-fg select-all">
                  {state.tempPassword}
                </code>
              </p>
              <p className="mt-1 text-xs text-muted">
                {state.emailed
                  ? "Passordet er også sendt på e-post. Brukeren bør bytte via «Glemt passord» ved første innlogging."
                  : "E-posten kunne ikke sendes – gi passordet videre manuelt."}
              </p>
            </div>
          )}
        </form>
      )}
    </Card>
  );
}

/** Slett-knapp per rad (ikke for egen bruker). */
export function DeleteUserButton({ userId, email }: { userId: string; email: string | null }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end">
      <ConfirmButton
        label="Slett"
        question={`Slette innloggingen til ${email ?? "brukeren"}? Dette kan ikke angres.`}
        confirmLabel="Ja, slett"
        pendingLabel="Sletter …"
        onConfirm={async () => {
          const r = await deleteUser(userId);
          if (r.error) setErr(r.error);
          return r.error ? { ok: false, error: r.error } : { ok: true };
        }}
      />
      {err && <p className="text-[11px] text-danger">{err}</p>}
    </div>
  );
}
