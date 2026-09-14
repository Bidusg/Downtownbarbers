import { createClient } from "@/lib/supabase/server";

export const ROLES = ["admin", "shop", "staff", "revisor", "customer"] as const;

/* =====================================================================
 * BRUKERE & ROLLER
 *   Leser app-brukere fra profiles (admin ser alle via RLS).
 * ===================================================================== */

export type AppUser = {
  id: string;
  email: string | null;
  role: string;
  created_at: string | null;
};

export async function getUsers(): Promise<AppUser[]> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("profiles")
      .select("id, email, role, created_at")
      .order("role")
      .order("email");
    return (data ?? []).map((p) => ({
      id: p.id as string,
      email: (p.email as string) ?? null,
      role: (p.role as string) ?? "customer",
      created_at: (p.created_at as string) ?? null,
    }));
  } catch {
    return [];
  }
}
