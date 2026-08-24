import { getCustomers } from "@/lib/admin-queries";

export default async function AdminKunder() {
  const customers = await getCustomers();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Kundekartotek</h1>
        <span className="text-sm text-muted">{customers.length} kunder</span>
      </div>
      <div className="overflow-x-auto border border-line">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Navn</th>
              <th className="px-4 py-3">Telefon</th>
              <th className="px-4 py-3">E-post</th>
              <th className="px-4 py-3">Kategori</th>
              <th className="px-4 py-3">Besøk</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Ingen kunder enda. De registreres automatisk ved booking.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-3 font-medium text-fg">{c.full_name}</td>
                <td className="px-4 py-3 text-muted">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{c.category ?? "—"}</td>
                <td className="px-4 py-3 font-display">{c.visits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
