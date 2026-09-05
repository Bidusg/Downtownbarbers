"use client";

import { useState, useTransition } from "react";
import { completeBooking } from "@/app/kasse/actions";

const PAYMENTS = ["Kontant", "Kort", "Vipps"];

const inputCls =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted transition-colors focus:border-accent-soft focus:outline-none";

/**
 * Betaling ved fullført time: valgfri kundeinfo (drop-in → CRM),
 * kvittering på e-post, og betalingsmåte. Gjenbrukes i dagsliste + kalender.
 */
export function PaymentControls({
  bookingId,
  customerName,
  customerEmail,
  onDone,
}: {
  bookingId: string;
  customerName: string;
  customerEmail: string | null;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const hasEmail = !!customerEmail;
  const [showInfo, setShowInfo] = useState(!hasEmail);
  const [name, setName] = useState(
    customerName && customerName !== "—" ? customerName : "",
  );
  const [email, setEmail] = useState(customerEmail ?? "");
  const [phone, setPhone] = useState("");
  const [receipt, setReceipt] = useState(hasEmail);

  function pay(method: string) {
    start(async () => {
      await completeBooking(bookingId, {
        paymentMethod: method,
        customer: showInfo ? { name, email, phone } : undefined,
        sendReceipt: receipt && !!(email.trim() || customerEmail),
      });
      onDone();
    });
  }

  return (
    <div>
      {showInfo ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Navn"
            className={inputCls}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-post (for kvittering)"
            className={inputCls}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Telefon"
            className={inputCls}
          />
        </div>
      ) : (
        <button
          onClick={() => setShowInfo(true)}
          className="mb-2 block text-xs font-semibold text-accent-soft hover:underline"
        >
          + Rediger kundeinfo
        </button>
      )}

      <label className="mb-3 flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={receipt}
          onChange={(e) => setReceipt(e.target.checked)}
        />
        Send kvittering på e-post
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Betalt med:</span>
        {PAYMENTS.map((p) => (
          <button
            key={p}
            disabled={pending}
            onClick={() => pay(p)}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
