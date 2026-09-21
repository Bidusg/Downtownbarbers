import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "eier" | "shop" | "staff" | "customer" | "revisor";

/** «Admin-lik» tilgang: admin OG eier. Eier (Dawit) har full tilgang overalt
 *  – som admin – og skal passere alle admin-vakter. Speiler is_admin() i SQL,
 *  som også teller 'eier' som admin. */
export function isAdminRole(role: Role | string | null | undefined): boolean {
  return role === "admin" || role === "eier";
}

/** Henter innlogget bruker + rolle (fra profiles). Null hvis ikke innlogget. */
export async function getUserRole(): Promise<{
  userId: string;
  email: string | null;
  role: Role;
} | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return {
      userId: user.id,
      email: user.email ?? null,
      role: (profile?.role as Role) ?? "customer",
    };
  } catch {
    return null;
  }
}

/** Krever at brukeren har en av rollene, ellers redirect. Returnerer rollen. */
export async function requireRole(allowed: Role[]): Promise<Role> {
  const me = await getUserRole();
  if (!me) redirect("/logg-inn");
  // Eier teller som admin: passerer der 'admin' er tillatt.
  const ok =
    allowed.includes(me.role) ||
    (isAdminRole(me.role) && allowed.includes("admin"));
  if (!ok) redirect("/logg-inn?feil=tilgang");
  return me.role;
}

/** Standard landingsside etter innlogging, basert på rolle. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "admin":
    case "eier":
      return "/admin";
    case "shop":
      return "/kasse";
    case "staff":
      return "/ansatt";
    case "revisor":
      return "/revisor";
    default:
      return "/";
  }
}
