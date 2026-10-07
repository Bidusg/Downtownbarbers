"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Send-knapp med bekreftelse (antall mottakere) og dobbeltklikk-vern.
 * Ligger inne i <form action={sendMarketing}>; bekreftelsen er et eget
 * vindu, og selve innsendingen skjer først når brukeren bekrefter.
 */
export function SendMarketingButton({ emailCount, smsCount }: { emailCount: number; smsCount: number }) {
  const { pending } = useFormStatus();
  const [confirm, setConfirm] = useState<{ channel: string; segment: string } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={(e) => {
          const form = (e.currentTarget as HTMLButtonElement).form;
          if (!form) return;
          if (!form.reportValidity()) return;
          const fd = new FormData(form);
          const channel = String(fd.get("channel") ?? "email");
          const body = String(fd.get("body") ?? "").trim();
          const subject = String(fd.get("subject") ?? "").trim();
          if (!body || (channel === "email" && !subject)) {
            form.reportValidity();
            return;
          }
          const sel = form.querySelector<HTMLSelectElement>("select[name=segment]");
          setConfirm({ channel, segment: sel?.selectedOptions[0]?.text ?? "valgt segment" });
        }}
        className="bg-accent px-5 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60"
      >
        {pending ? "Starter utsending …" : "Send til segment"}
      </button>

      {confirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-fg">Send utsendingen?</h3>
            <p className="mt-2 text-sm text-muted">
              Kanal: <strong className="text-fg">{confirm.channel === "sms" ? "SMS" : "E-post"}</strong>
              <br />
              Segment: <strong className="text-fg">{confirm.segment}</strong>
              <br />
              {confirm.segment.startsWith("Alle") && (
                <>
                  Inntil{" "}
                  <strong className="text-fg">
                    {(confirm.channel === "sms" ? smsCount : emailCount).toLocaleString("nb-NO")}
                  </strong>{" "}
                  mottakere.
                </>
              )}
            </p>
            <p className="mt-3 text-xs text-muted">
              Utsendingen går i bakgrunnen – du kan følge fremdriften under «Sendt før».
              Kan ikke angres når den er startet.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="border border-line-2 px-4 py-2 text-sm text-fg"
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={pending}
                className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60"
              >
                {pending ? "Starter …" : "Ja, send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
