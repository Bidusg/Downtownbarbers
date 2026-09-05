import { createClient } from "@supabase/supabase-js";

/**
 * Privilegert Supabase-klient (service-role) for server-til-server-bruk
 * uten innlogget bruker – f.eks. webhooks som skriver eksterne salg.
 * Bruker SUPABASE_SERVICE_ROLE_KEY og bypasser RLS. Må ALDRI eksponeres
 * til klienten. Kall den kun i route handlers / server-kode.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Mangler SUPABASE_SERVICE_ROLE_KEY / URL for service-klient.");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
