"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { RestPreview } from "@/app/admin/markedsforing/actions";

function Submit({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60"
    >
      {pending ? "Starter …" : `Send til ${count.toLocaleString("nb-NO")}`}
    </button>
  );
}

/**
 * «Send til resten»: viser først en forhåndsvisning med tall (hvor mange
 * har fått den, hvor mange får den nå), og sender bare når vi faktisk vet
 * hvem som har fått den.
 */
export function SendRestButton({
  action,
  preview,
  subject,
}: {
  action: () => Promise<void>;
  preview: () => Promise<RestPreview>;
  subject: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RestPreview | null>(null);
  const [loading, setLoading] = useState(false);

  async function openDialog() {
    setOpen(true);
    setData(null);
    setLoading(true);
    try {
      setData(await preview());
    } catch {
      setData({ ok: false, total: 0, already: 0, rest: 0, resendStatus: "error", error: "Noe gikk galt." });
    }
    setLoading(false);
  }

  const n = (x: number) => x.toLocaleString("nb-NO");

  return (
    <>
      <button type="button" onClick={openDialog} className="act act-accent">
        Send til resten
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <form action={action} className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-fg">Send til de som ikke har fått den</h3>
            <p className="mt-1 text-sm text-muted">«{subject}»</p>

            {loading && (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent-soft" />
                Sjekker hvem som har fått den (vår logg + Resend) …
              </p>
            )}

            {data && data.error && <p className="mt-4 text-sm text-danger">{data.error}</p>}

            {data && !data.error && (
              <div className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Kan nås på e-post</span>
                  <span className="text-fg tabular-nums">{n(data.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Har allerede fått den</span>
                  <span className="text-fg tabular-nums">{data.ok ? n(data.already) : "ukjent"}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-1 font-semibold">
                  <span className="text-fg">Får den nå</span>
                  <span className="text-accent-soft tabular-nums">{data.ok ? n(data.rest) : "—"}</span>
                </div>

                {!data.ok && (
                  <div className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-fg">
                    {data.resendStatus === "restricted" ? (
                      <>
                        <strong>Vi får ikke lest Resend-loggen.</strong> API-nøkkelen har bare
                        «Sending access». Uten loggen vet vi ikke hvem som fikk e-posten
                        kl. 14:07, så vi sender ikke (for å unngå dobbel e-post).
                        <br />
                        <br />
                        Løsning: Resend → API Keys → <em>Create API Key</em> med
                        <em> Full access</em>, og legg den inn i Vercel → Settings →
                        Environment Variables som <code>RESEND_LOG_KEY</code>. Redeploy, og prøv igjen.
                      </>
                    ) : (
                      <>
                        <strong>Kunne ikke lese Resend-loggen</strong> – ingenting sendt.
                        {data.resendDetail && <span className="mt-1 block text-muted">{data.resendDetail}</span>}
                      </>
                    )}
                  </div>
                )}
                {data.ok && data.rest === 0 && (
                  <p className="mt-3 text-xs text-muted">Alle har allerede fått den – ingenting å sende.</p>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="border border-line-2 px-4 py-2 text-sm text-fg">
                Lukk
              </button>
              {data?.ok && data.rest > 0 && <Submit count={data.rest} />}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
