"use client";

import { useState, useTransition } from "react";
import type { AdminProduct } from "@/lib/admin-queries";
import {
  createProduct,
  toggleProduct,
  deleteProduct,
} from "@/app/admin/produkter/actions";

export function ProductManager({ products }: { products: AdminProduct[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{products.length} produkter</p>
        <button
          onClick={() => setOpen((o) => !o)}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {open ? "Lukk" : "+ Nytt produkt"}
        </button>
      </div>

      {open && (
        <form
          action={async (fd) => {
            await createProduct(fd);
            setOpen(false);
          }}
          className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
        >
          <input name="name" placeholder="Navn" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="price_nok" type="number" placeholder="Pris (kr)" required className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <input name="stock" type="number" placeholder="Lager" defaultValue={0} className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft" />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input name="is_gift_card" type="checkbox" /> Gavekort
          </label>
          <input name="description" placeholder="Beskrivelse" className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft sm:col-span-2" />
          <label className="text-xs text-muted sm:col-span-2">
            Bilde
            <input name="image" type="file" accept="image/*" className="mt-1 block w-full text-xs" />
          </label>
          <button type="submit" className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover sm:col-span-2">
            Lagre produkt
          </button>
        </form>
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Produkt</th>
              <th className="px-4 py-3">Pris</th>
              <th className="px-4 py-3">Lager</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Ingen produkter enda – legg til det første, eller koble til Supabase.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">{p.name}</td>
                <td className="px-4 py-3 font-display">{p.price_nok} kr</td>
                <td className="px-4 py-3 text-muted">{p.stock}</td>
                <td className="px-4 py-3 text-muted">{p.is_gift_card ? "Gavekort" : "Produkt"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => start(() => toggleProduct(p.id, !p.active))}
                    disabled={pending}
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                      (p.active ? "bg-accent-soft/15 text-accent-soft" : "bg-surface-2 text-muted")
                    }
                  >
                    {p.active ? "Aktiv" : "Skjult"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => start(() => deleteProduct(p.id))}
                    disabled={pending}
                    className="text-xs text-danger hover:underline"
                  >
                    Slett
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
