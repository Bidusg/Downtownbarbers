import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "shop" | "staff" | "customer";

/** Henter innlogget bruker + rolle (fra profiles). Null hvis ikke innlogget. */
export async function getUserRole(): Promise<{
  userId: string;
  email: string | null;
  role: Role;
} | null> {
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
}

/** Krever at brukeren har en av rollene, ellers redirect. Returnerer rollen. */
export async function requireRole(allowed: Role[]): Promise<Role> {
  const me = await getUserRole();
  if (!me) redirect("/logg-inn");
  if (!allowed.includes(me.role)) redirect("/logg-inn?feil=tilgang");
  return me.role;
}

/** Standard landingsside etter innlogging, basert på rolle. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "shop":
      return "/kasse";
    case "staff":
      return "/ansatt";
    default:
      return "/";
  }
}
