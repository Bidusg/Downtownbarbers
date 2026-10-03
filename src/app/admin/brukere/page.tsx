import { getUserRole } from "@/lib/auth";
import { getUsers, ROLES } from "@/lib/users-queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, Tr, Th, Td, TableEmpty } from "@/components/ui/Table";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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

      <Card className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span><strong className="text-fg">Admin</strong> — full tilgang</span>
        <span><strong className="text-fg">Eier</strong> — full tilgang, ingen shop-begrensninger</span>
        <span><strong className="text-fg">Kasse</strong> — skranke, ingen sensitive tall</span>
        <span><strong className="text-fg">Ansatt</strong> — kun eget</span>
        <span><strong className="text-fg">Revisor</strong> — regnskap/eksport</span>
        <span><strong className="text-fg">Kunde</strong> — ingen admin-tilgang</span>
      </Card>

      <Card padded={false}>
        <Table>
          <THead>
            <Tr head>
              <Th>Bruker</Th>
              <Th className="px-4">Rolle</Th>
              <Th className="px-4">Endre til</Th>
              <Th className="px-4">Opprettet</Th>
            </Tr>
          </THead>
          <TBody>
            {users.length === 0 ? (
              <TableEmpty colSpan={4}>Ingen brukere funnet.</TableEmpty>
            ) : (
              users.map((u) => {
                const isMe = me?.userId === u.id;
                return (
                  <Tr key={u.id}>
                    <Td>
                      <span className="text-fg">{u.email ?? "—"}</span>
                      {isMe && <span className="ml-2 text-xs text-muted">(deg)</span>}
                    </Td>
                    <Td className="px-4">
                      <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + (ROLE_STYLE[u.role] ?? "bg-surface-2 text-muted")}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </Td>
                    <Td className="px-4">
                      {isMe ? (
                        <span className="text-xs text-muted">Kan ikke endre egen rolle</span>
                      ) : (
                        <form action={setUserRole} className="flex items-center gap-1.5">
                          <input type="hidden" name="userId" value={u.id} />
                          <Select
                            name="role"
                            defaultValue={u.role}
                            className="w-auto rounded-none px-2 py-1"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                            ))}
                          </Select>
                          <Button
                            type="submit"
                            variant="subtle"
                            className="px-2.5 py-1 text-xs"
                          >
                            Sett
                          </Button>
                        </form>
                      )}
                    </Td>
                    <Td className="px-4 whitespace-nowrap" muted>{fmt(u.created_at)}</Td>
                  </Tr>
                );
              })
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
