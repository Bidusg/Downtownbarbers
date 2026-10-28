import { createClient } from "@supabase/supabase-js";

/**
 * Anonym Supabase-klient uten informasjonskapsler – for offentlige data som
 * mellomlagres (unstable_cache), der cookies() ikke kan brukes. Ser det samme
 * som en besøkende som ikke er logget inn (RLS for anon).
 */
export function createPublicClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
