"use client";

import { useState, useTransition } from "react";
import type { AdminService, Category } from "@/lib/admin-queries";
import {
  createService,
  updateService,
  toggleService,
  deleteService,
} from "@/app/admin/tjenester/actions";

function ServiceForm({
  categories,
  service,
  onDone,
}: {
  categories: Category[];
  service?: AdminService;
  onDone: () => void;
}) {
  return (
    <form
      action={async (fd) => {
        if (service) await updateService(service.id, fd);
        else await createService(fd);
        onDone();
      }}
      className="grid gap-3 border border-line bg-surface p-5 sm:grid-cols-2"
    >
      <input
        name="name"
        placeholder="Navn"
        required
        defaultValue={service?.name ?? ""}
        className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft"
      />
      <select
        name="category_id"
        defaultValue={service?.category_id ?? ""}
        className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft"
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        name="price_nok"
        type="number"
        placeholder="Pris (kr)"
        required
        defaultValue={service?.price_nok ?? ""}
        className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft"
      />
      <input
        name="duration_min"
        type="number"
        placeholder="Varighet (min)"
        defaultValue={service?.duration_min ?? 30}
        className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft"
      />
      <input
        name="description"
        placeholder="Beskrivelse"
        defaultValue={service?.description ?? ""}
        className="border border-line-2 bg-canvas px-3 py-2 text-sm outline-none focus:border-accent-soft sm:col-span-2"
      />
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {service ? "Lagre endringer" : "Lagre tjeneste"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-sm text-muted hover:text-fg"
        >
          Avbryt
        </button>
      </div>
    </form>
  );
}

export function ServiceManager({
  services,
  categories,
}: {
  services: AdminService[];
  categories: Category[];
}) {
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{services.length} tjenester</p>
        <button
          onClick={() => {
            setCreating((o) => !o);
            setEditId(null);
          }}
          className="bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:bg-accent-hover"
        >
          {creating ? "Lukk" : "+ Ny tjeneste"}
        </button>
      </div>

      {creating && (
        <ServiceForm
          categories={categories}
          onDone={() => setCreating(false)}
        />
      )}

      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Tjeneste</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Pris</th>
              <th className="px-4 py-3">Varighet</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Ingen tjenester enda – legg til den første, eller koble til Supabase.
                </td>
              </tr>
            )}
            {services.map((s) =>
              editId === s.id ? (
                <tr key={s.id} className="border-t border-line">
                  <td colSpan={6} className="p-4">
                    <ServiceForm
                      categories={categories}
                      service={s}
                      onDone={() => setEditId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={s.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <span className="font-medium text-fg">{s.name}</span>
                    {s.description && (
                      <span className="block text-xs text-muted">
                        {s.description}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{s.categoryName}</td>
                  <td className="px-4 py-3 font-display">{s.price_nok} kr</td>
                  <td className="px-4 py-3 text-muted">{s.duration_min} min</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => start(() => toggleService(s.id, !s.active))}
                      disabled={pending}
                      className={
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                        (s.active
                          ? "bg-accent-soft/15 text-accent-soft"
                          : "bg-surface-2 text-muted")
                      }
                    >
                      {s.active ? "Aktiv" : "Skjult"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        setEditId(s.id);
                        setCreating(false);
                      }}
                      className="text-xs text-accent-soft hover:underline"
                    >
                      Rediger
                    </button>
                    <span className="mx-2 text-line-2">·</span>
                    <button
                      onClick={() => start(() => deleteService(s.id))}
                      disabled={pending}
                      className="text-xs text-danger hover:underline"
                    >
                      Slett
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
