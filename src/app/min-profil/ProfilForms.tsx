"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { SubmitButton } from "@/components/ui/SubmitButton";
import {
  updateProfile,
  changePassword,
  changeEmail,
  type ProfilState,
} from "./actions";

const initial: ProfilState = {};

/** Liten status-linje (suksess/feil) under hvert skjema. */
function Status({ state }: { state: ProfilState }) {
  if (state.error) return <p className="text-sm text-danger">{state.error}</p>;
  if (state.ok && state.message)
    return <p className="text-sm text-accent-soft">{state.message}</p>;
  return null;
}

/** Grunnopplysninger: navn + telefon (profiles). */
export function ProfileCard({
  fullName,
  phone,
}: {
  fullName: string;
  phone: string;
}) {
  const [state, action] = useActionState(updateProfile, initial);
  return (
    <Card title="Grunnopplysninger">
      <form action={action} className="space-y-4">
        <Field label="Navn" htmlFor="full_name">
          <Input
            id="full_name"
            name="full_name"
            defaultValue={fullName}
            required
            minLength={2}
            maxLength={120}
            autoComplete="name"
          />
        </Field>
        <Field label="Telefon" htmlFor="phone" hint="Valgfritt.">
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={phone}
            inputMode="tel"
            autoComplete="tel"
            placeholder="+47 000 00 000"
          />
        </Field>
        <Status state={state} />
        <SubmitButton>Lagre</SubmitButton>
      </form>
    </Card>
  );
}

/** Endre e-post (Supabase Auth, med bekreftelseslenke). */
export function EmailCard({ currentEmail }: { currentEmail: string }) {
  const [state, action] = useActionState(changeEmail, initial);
  return (
    <Card title="E-post">
      <form action={action} className="space-y-4">
        <Field
          label="Ny e-postadresse"
          htmlFor="email"
          hint="Du må bekrefte den nye adressen via lenken vi sender dit."
        >
          <Input
            id="email"
            name="email"
            type="email"
            required
            defaultValue={currentEmail}
            autoComplete="email"
          />
        </Field>
        <Status state={state} />
        <SubmitButton>Endre e-post</SubmitButton>
      </form>
    </Card>
  );
}

/** Endre passord (Supabase Auth). */
export function PasswordCard() {
  const [state, action] = useActionState(changePassword, initial);
  return (
    <Card title="Passord">
      <form action={action} className="space-y-4">
        <Field label="Nytt passord" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Gjenta passord" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        </Field>
        <Status state={state} />
        <SubmitButton>Lagre nytt passord</SubmitButton>
      </form>
    </Card>
  );
}
