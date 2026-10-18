"use client";

import type { SmsConfigStatus } from "@/lib/sms";
import { saveSmsConfig } from "@/app/admin/integrasjoner/actions";
import { Card } from "@/components/ui/Card";
import { Input, Field } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function SmsConfigForm({ status }: { status: SmsConfigStatus }) {
  return (
    <div className="space-y-8">
      <form action={saveSmsConfig} className="space-y-6">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <h3 className="font-semibold text-fg">GatewayAPI</h3>
              <Badge tone={status.configured && status.gatewayapiSet ? "success" : "neutral"}>
                {status.configured && status.gatewayapiSet ? "Aktiv" : "Ikke aktiv"}
              </Badge>
            </div>
            <input type="hidden" name="provider" value="gatewayapi" />
            <Field label="Avsendernavn" htmlFor="sender">
              <Input
                id="sender"
                name="sender"
                defaultValue={status.sender}
                placeholder="Downtown"
                maxLength={11}
              />
            </Field>
            <Field label="API-token" htmlFor="gatewayapi_token" className="sm:col-span-2">
              <Input
                id="gatewayapi_token"
                name="gatewayapi_token"
                type="password"
                autoComplete="off"
                placeholder={status.gatewayapiSet ? "•••• lagret – la stå tomt for å beholde" : "Lim inn API-token fra gatewayapi.com"}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-fg sm:col-span-2">
              <input type="checkbox" name="enabled" defaultChecked={status.enabled} className="accent-[#F47721]" />
              SMS aktivert
            </label>
          </div>
        </Card>

        <Button type="submit" variant="primary" className="px-5 py-2.5 text-sm">
          Lagre SMS-oppsett
        </Button>
      </form>

    </div>
  );
}
