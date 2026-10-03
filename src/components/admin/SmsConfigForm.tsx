"use client";

import { useActionState } from "react";
import type { SmsConfigStatus } from "@/lib/sms";
import {
  saveSmsConfig,
  sendTestSms,
  type TestSmsState,
} from "@/app/admin/integrasjoner/actions";
import { Card } from "@/components/ui/Card";
import { Input, Select, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

function KeyBadge({ set }: { set: boolean }) {
  return (
    <Badge tone={set ? "success" : "neutral"}>
      {set ? "Nøkkel satt" : "Ikke satt"}
    </Badge>
  );
}

const PROVIDERS = [
  { value: "", label: "Auto (gjett fra nøkler)" },
  { value: "gatewayapi", label: "GatewayAPI (anbefalt)" },
  { value: "sveve", label: "Sveve" },
  { value: "twilio", label: "Twilio" },
  { value: "generic", label: "Generisk HTTP" },
];

export function SmsConfigForm({ status }: { status: SmsConfigStatus }) {
  const [testState, testAction, testing] = useActionState<TestSmsState, FormData>(
    sendTestSms,
    null,
  );

  return (
    <div className="space-y-8">
      <form action={saveSmsConfig} className="space-y-6">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-fg">Leverandør</h3>
              <Badge tone={status.configured ? "success" : "neutral"}>
                {status.configured
                  ? `Aktiv · ${status.effectiveProvider}`
                  : "Ikke aktiv"}
              </Badge>
            </div>
            <Field label="Leverandør" htmlFor="provider">
              <Select id="provider" name="provider" defaultValue={status.provider}>
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Avsendernavn" htmlFor="sender">
              <Input
                id="sender"
                name="sender"
                defaultValue={status.sender}
                placeholder="Downtown"
                maxLength={11}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={status.enabled} className="accent-[#F47721]" />
              SMS aktivert
            </label>
          </div>
        </Card>

        {/* GatewayAPI */}
        <Card>
          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-fg">GatewayAPI</h3>
              <KeyBadge set={status.gatewayapiSet} />
            </div>
            <Field label="API-token" htmlFor="gatewayapi_token">
              <Input
                id="gatewayapi_token"
                name="gatewayapi_token"
                type="password"
                autoComplete="off"
                placeholder={status.gatewayapiSet ? "•••• – la stå tomt for å beholde" : "Lim inn token"}
              />
            </Field>
          </div>
        </Card>

        {/* Sveve */}
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-fg">Sveve</h3>
              <KeyBadge set={status.sveveSet} />
            </div>
            <Field label="Brukernavn" htmlFor="sveve_user">
              <Input id="sveve_user" name="sveve_user" autoComplete="off" placeholder={status.sveveSet ? "•••• – la stå tomt" : "Brukernavn"} />
            </Field>
            <Field label="Passord" htmlFor="sveve_password">
              <Input id="sveve_password" name="sveve_password" type="password" autoComplete="off" placeholder={status.sveveSet ? "•••• – la stå tomt" : "Passord"} />
            </Field>
          </div>
        </Card>

        {/* Twilio */}
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-fg">Twilio</h3>
              <KeyBadge set={status.twilioSet} />
            </div>
            <Field label="Account SID" htmlFor="twilio_account_sid">
              <Input id="twilio_account_sid" name="twilio_account_sid" autoComplete="off" placeholder={status.twilioSet ? "•••• – la stå tomt" : "AC…"} />
            </Field>
            <Field label="Auth token" htmlFor="twilio_auth_token">
              <Input id="twilio_auth_token" name="twilio_auth_token" type="password" autoComplete="off" placeholder={status.twilioSet ? "•••• – la stå tomt" : "Auth token"} />
            </Field>
            <Field label="Fra-nummer (E.164)" htmlFor="twilio_from" className="sm:col-span-2">
              <Input id="twilio_from" name="twilio_from" defaultValue={status.twilioFrom} placeholder="+47…" />
            </Field>
          </div>
        </Card>

        {/* Generisk */}
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-fg">Generisk HTTP</h3>
              <KeyBadge set={status.genericKeySet} />
            </div>
            <Field label="API-URL" htmlFor="generic_api_url">
              <Input id="generic_api_url" name="generic_api_url" defaultValue={status.genericUrl} placeholder="https://…" />
            </Field>
            <Field label="API-nøkkel (bearer)" htmlFor="generic_api_key">
              <Input id="generic_api_key" name="generic_api_key" type="password" autoComplete="off" placeholder={status.genericKeySet ? "•••• – la stå tomt" : "Lim inn nøkkel"} />
            </Field>
          </div>
        </Card>

        <Button type="submit" variant="primary" className="px-5 py-2.5 text-sm">
          Lagre SMS-oppsett
        </Button>
      </form>

      {/* Test-sending */}
      <form action={testAction}>
        <Card>
          <h3 className="font-semibold text-fg">Send test-SMS</h3>
          <p className="mt-1 text-sm text-muted">
            Bekreft at oppsettet virker. Lagre først, så send en test til ditt eget nummer.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Field label="Mottakernummer" htmlFor="to">
              <Input id="to" name="to" placeholder="+47…" className="min-w-[12rem]" />
            </Field>
            <Button
              type="submit"
              variant="subtle"
              disabled={testing}
              className="px-4 py-2 text-sm transition-colors"
            >
              {testing ? "Sender…" : "Send test"}
            </Button>
          </div>
          {testState && (
            <p className={"mt-3 text-sm " + (testState.ok ? "text-accent-soft" : "text-danger")}>
              {testState.message}
            </p>
          )}
        </Card>
      </form>
    </div>
  );
}
