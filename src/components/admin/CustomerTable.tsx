"use client";

import { useState } from "react";
import type { AdminCustomer } from "@/lib/admin-queries";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nb-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function CustomerTable({
  customers,
  basePath = "/admin/kunder",
}: {
  customers: AdminCustomer[];
  basePath?: string;
}) {
  const [q, setQ] = useState("");
  const norm = q.trim().toLowerCase();
  const filtered = norm
    ? customers.filter((c) =>
        [c.full_name, c.email, c.phone, c.category].some((v) =>
          (v ?? "").toLowerCase().includes(norm),
        ),
      )
    : customers;

  return (
    <div>
      <div className="mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Søk på navn, e-post eller telefon…"
          className="w-full max-w-sm border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent-soft focus:outline-none"
        />
      </div>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Bookinger</th>
              <th className="px-4 py-3">Sist</th>
              <th className="px-4 py-3">Brukt</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {customers.length === 0
                    ? "Ingen kunder enda. De registreres automatisk ved booking."
                    : "Ingen treff."}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-t border-line hover:bg-surface-2/50"
              >
                <td className="px-4 py-3">
                  <a
                    href={`${basePath}/${c.id}`}
                    className="font-medium text-fg hover:text-accent-soft hover:underline"
                  >
                    {c.full_name}
                  </a>
                  {c.noShows > 0 && (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-danger">
                      {c.noShows} ikke møtt
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  <span className="flex flex-col gap-0.5">
                    {c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        className="text-accent-soft hover:underline"
                      >
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a
                        href={`mailto:${c.email}`}
                        className="text-muted hover:text-fg hover:underline"
                      >
                        {c.email}
                      </a>
                    )}
                    {!c.phone && !c.email && (
                      <span className="text-muted">—</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 font-display">{c.visits}</td>
                <td className="px-4 py-3 text-muted">{fmtDate(c.lastVisit)}</td>
                <td className="px-4 py-3 font-display">
                  {c.totalSpent > 0 ? `${c.totalSpent} kr` : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <a
                    href={`${basePath}/${c.id}`}
                    className="text-xs font-semibold text-muted hover:text-fg"
                  >
                    Åpne →
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
