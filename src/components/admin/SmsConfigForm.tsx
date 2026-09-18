"use client";

import { useActionState } from "react";
import type { SmsConfigStatus } from "@/lib/sms";
import {
  saveSmsConfig,
  sendTestSms,
  type TestSmsState,
} from "@/app/admin/integrasjoner/actions";

const inputCls =
  "w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent-soft";

function KeyBadge({ set }: { set: boolean }) {
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        (set ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
      }
    >
      {set ? "Nøkkel satt" : "Ikke satt"}
    </span>
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
        <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="font-semibold text-fg">Leverandør</h3>
            <span
              className={
                "rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
                (status.configured
                  ? "bg-accent-soft/15 text-accent-soft"
                  : "bg-surface-2 text-muted")
              }
            >
              {status.configured
                ? `Aktiv · ${status.effectiveProvider}`
                : "Ikke aktiv"}
            </span>
          </div>
          <label className="text-xs text-muted">
            Leverandør
            <select name="provider" defaultValue={status.provider} className={`mt-1 ${inputCls}`}>
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Avsendernavn
            <input
              name="sender"
              defaultValue={status.sender}
              placeholder="Downtown"
              maxLength={11}
              className={`mt-1 ${inputCls}`}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
            <input type="checkbox" name="enabled" defaultChecked={status.enabled} className="accent-[#F47721]" />
            SMS aktivert
          </label>
        </div>

        {/* GatewayAPI */}
        <div className="grid gap-3 border border-line bg-surface-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-fg">GatewayAPI</h3>
            <KeyBadge set={status.gatewayapiSet} />
          </div>
          <label className="text-xs text-muted">
            API-token
            <input
              name="gatewayapi_token"
              type="password"
              autoComplete="off"
              placeholder={status.gatewayapiSet ? "•••• – la stå tomt for å beholde" : "Lim inn token"}
              className={`mt-1 ${inputCls}`}
            />
          </label>
        </div>

        {/* Sveve */}
        <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="font-semibold text-fg">Sveve</h3>
            <KeyBadge set={status.sveveSet} />
          </div>
          <label className="text-xs text-muted">
            Brukernavn
            <input name="sveve_user" autoComplete="off" placeholder={status.sveveSet ? "•••• – la stå tomt" : "Brukernavn"} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Passord
            <input name="sveve_password" type="password" autoComplete="off" placeholder={status.sveveSet ? "•••• – la stå tomt" : "Passord"} className={`mt-1 ${inputCls}`} />
          </label>
        </div>

        {/* Twilio */}
        <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="font-semibold text-fg">Twilio</h3>
            <KeyBadge set={status.twilioSet} />
          </div>
          <label className="text-xs text-muted">
            Account SID
            <input name="twilio_account_sid" autoComplete="off" placeholder={status.twilioSet ? "•••• – la stå tomt" : "AC…"} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            Auth token
            <input name="twilio_auth_token" type="password" autoComplete="off" placeholder={status.twilioSet ? "•••• – la stå tomt" : "Auth token"} className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted sm:col-span-2">
            Fra-nummer (E.164)
            <input name="twilio_from" defaultValue={status.twilioFrom} placeholder="+47…" className={`mt-1 ${inputCls}`} />
          </label>
        </div>

        {/* Generisk */}
        <div className="grid gap-3 border border-line bg-surface-2 p-5 sm:grid-cols-2">
          <div className="flex items-center justify-between sm:col-span-2">
            <h3 className="font-semibold text-fg">Generisk HTTP</h3>
            <KeyBadge set={status.genericKeySet} />
          </div>
          <label className="text-xs text-muted">
            API-URL
            <input name="generic_api_url" defaultValue={status.genericUrl} placeholder="https://…" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="text-xs text-muted">
            API-nøkkel (bearer)
            <input name="generic_api_key" type="password" autoComplete="off" placeholder={status.genericKeySet ? "•••• – la stå tomt" : "Lim inn nøkkel"} className={`mt-1 ${inputCls}`} />
          </label>
        </div>

        <button type="submit" className="bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover">
          Lagre SMS-oppsett
        </button>
      </form>

      {/* Test-sending */}
      <form action={testAction} className="border border-line bg-surface p-5">
        <h3 className="font-semibold text-fg">Send test-SMS</h3>
        <p className="mt-1 text-sm text-muted">
          Bekreft at oppsettet virker. Lagre først, så send en test til ditt eget nummer.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Mottakernummer
            <input name="to" placeholder="+47…" className={inputCls + " min-w-[12rem]"} />
          </label>
          <button
            type="submit"
            disabled={testing}
            className="border border-line-2 px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {testing ? "Sender…" : "Send test"}
          </button>
        </div>
        {testState && (
          <p className={"mt-3 text-sm " + (testState.ok ? "text-accent-soft" : "text-danger")}>
            {testState.message}
          </p>
        )}
      </form>
    </div>
  );
}
