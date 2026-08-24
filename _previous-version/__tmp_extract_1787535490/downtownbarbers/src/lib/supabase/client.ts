import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase-klient for bruk i nettleseren (client components).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
