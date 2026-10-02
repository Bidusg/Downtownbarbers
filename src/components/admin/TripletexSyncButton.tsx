"use client";

import { useState, useTransition } from "react";
import { syncTripletexNow } from "@/app/admin/regnskap/actions";

/**
 * Admin-knapp som kjører Tripletex-synken manuelt (henter regnskapstall inn i
 * Supabase). Viser status via useTransition. `lastSync` er en ferdig formatert
 * streng ("Sist synket: …") eller null når ingenting er synket enda.
 */
export function TripletexSyncButton({ lastSync }: { lastSync: string | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = () => {
    setMsg(null);
    start(async () => {
      let r: { ok: boolean; error: string | null };
      try {
        r = await syncTripletexNow();
      } catch {
        setMsg({ ok: false, text: "Noe gikk galt. Prøv igjen." });
        return;
      }
      setMsg(
        r.ok
          ? { ok: true, text: "Synk fullført." }
          : { ok: false, text: r.error ?? "Synk feilet." },
      );
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Synker …" : "Synk nå"}
      </button>
      {lastSync && <span className="text-xs text-muted">{lastSync}</span>}
      {msg && (
        <span className={"text-sm " + (msg.ok ? "text-accent-soft" : "text-danger")}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
