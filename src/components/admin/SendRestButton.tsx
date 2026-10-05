"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg disabled:opacity-60"
    >
      {pending ? "Sjekker hvem som har fått den …" : "Ja, send til resten"}
    </button>
  );
}

/** «Send til resten» – sender en tidligere e-post til de som ikke har fått den. */
export function SendRestButton({ action, subject }: { action: () => Promise<void>; subject: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-accent-soft hover:underline">
        Send til resten
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <form action={action} className="w-full max-w-md rounded-lg border border-line bg-surface p-5 shadow-2xl">
            <h3 className="font-display text-lg font-bold text-fg">Send til de som ikke har fått den?</h3>
            <p className="mt-2 text-sm text-muted">
              «{subject}» sendes til alle med samtykke som <strong className="text-fg">ikke</strong> har fått
              den. Vi sjekker både vår egen logg og Resends logg, så ingen får den to ganger.
              Bouncede adresser regnes som ikke mottatt.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="border border-line-2 px-4 py-2 text-sm text-fg">
                Avbryt
              </button>
              <Submit />
            </div>
          </form>
        </div>
      )}
    </>
  );
}
