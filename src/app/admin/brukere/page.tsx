import { getUserRole } from "@/lib/auth";
import { getUsers, ROLES } from "@/lib/users-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { setUserRole } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  eier: "Eier",
  shop: "Kasse",
  staff: "Ansatt",
  revisor: "Revisor",
  customer: "Kunde",
};
const ROLE_STYLE: Record<string, string> = {
  admin: "bg-accent-soft/15 text-accent-soft",
  eier: "bg-accent/15 text-accent",
  shop: "bg-surface-2 text-fg",
  staff: "bg-surface-2 text-fg",
  revisor: "bg-surface-2 text-fg",
  customer: "bg-surface-2 text-muted",
};

function fmt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default async function AdminBrukere() {
  const [me, users] = await Promise.all([getUserRole(), getUsers()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Brukere & roller"
        description="Styr hvem som har tilgang til hva. Nye brukere opprettes i Supabase Auth (inviter på e-post) — her setter du rollen deres."
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 border border-line bg-surface px-5 py-4 text-xs text-muted">
        <span><strong className="text-fg">Admin</strong> — full tilgang</span>
        <span><strong className="text-fg">Eier</strong> — full tilgang, ingen shop-begrensninger</span>
        <span><strong className="text-fg">Kasse</strong> — skranke, ingen sensitive tall</span>
        <span><strong className="text-fg">Ansatt</strong> — kun eget</span>
        <span><strong className="text-fg">Revisor</strong> — regnskap/eksport</span>
        <span><strong className="text-fg">Kunde</strong> — ingen admin-tilgang</span>
      </div>

      <div className="border border-line bg-surface">
        {users.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted">Ingen brukere funnet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-6 py-3 font-medium">Bruker</th>
                  <th className="px-4 py-3 font-medium">Rolle</th>
                  <th className="px-4 py-3 font-medium">Endre til</th>
                  <th className="px-4 py-3 font-medium">Opprettet</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = me?.userId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-line last:border-0">
                      <td className="px-6 py-3">
                        <span className="text-fg">{u.email ?? "—"}</span>
                        {isMe && <span className="ml-2 text-xs text-muted">(deg)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + (ROLE_STYLE[u.role] ?? "bg-surface-2 text-muted")}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isMe ? (
                          <span className="text-xs text-muted">Kan ikke endre egen rolle</span>
                        ) : (
                          <form action={setUserRole} className="flex items-center gap-1.5">
                            <input type="hidden" name="userId" value={u.id} />
                            <select
                              name="role"
                              defaultValue={u.role}
                              className="border border-line-2 bg-canvas px-2 py-1 text-sm text-fg"
                            >
                              {ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="border border-line-2 px-2.5 py-1 text-xs font-semibold text-fg transition-colors hover:bg-surface-2"
                            >
                              Sett
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{fmt(u.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
