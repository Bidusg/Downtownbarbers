"use client";

import { useState, useTransition } from "react";
import { sendReceiptForBooking } from "@/app/kasse/actions";

export function SendReceiptButton({ bookingId }: { bookingId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <button
      disabled={pending || msg === "Sendt ✓"}
      onClick={() =>
        start(async () => {
          const r = await sendReceiptForBooking(bookingId);
          setMsg(r.error ?? "Sendt ✓");
        })
      }
      className="border border-line-2 px-2.5 py-1 text-xs text-muted hover:border-accent-soft hover:text-fg disabled:opacity-60"
    >
      {msg ?? (pending ? "…" : "Send kvittering")}
    </button>
  );
}
