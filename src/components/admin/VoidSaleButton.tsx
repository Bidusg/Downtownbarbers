"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSale } from "@/app/admin/omsetning/actions";

/** «Annuller»-knapp per salg med bekreftelse + årsak. Kun admin/eier. */
export function VoidSaleButton({ saleId, label }: { saleId: string; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-muted hover:text-danger hover:underline"
      >
        Annuller
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
      <div className="w-full max-w-md border border-line bg-surface p-5 shadow-2xl">
        <h3 className="font-display text-lg font-bold text-fg">Annuller salg</h3>
        <p className="mt-2 text-sm text-muted">
          {label} fjernes fra omsetningen. Lager og gavekort tilbakeføres, og
          en kopi logges (hvem/når/hvorfor). Kan ikke angres.
        </p>
        <label className="mt-4 block text-xs text-muted">
          Årsak
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="F.eks. testsalg, feil beløp, dobbeltregistrert"
            className="mt-1 w-full border border-line-2 bg-canvas px-3 py-2 text-sm text-fg"
            autoFocus
          />
        </label>
        {err && <p className="mt-2 text-sm text-danger">{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            className="border border-line-2 px-4 py-2 text-sm text-fg"
          >
            Avbryt
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setErr(null);
                const r = await voidSale(saleId, reason);
                if (r.error) setErr(r.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
            className="bg-danger px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Annullerer …" : "Ja, annuller"}
          </button>
        </div>
      </div>
    </div>
  );
}
