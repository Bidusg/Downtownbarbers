import { createClient } from "@/lib/supabase/server";

export type ContactMessage = {
  id: string;
  created_at: string;
  name: string;
  email: string | null;
  phone: string | null;
  topic: string;
  message: string;
  callback: boolean;
  status: "ny" | "behandlet";
  handled_at: string | null;
};

/** Henvendelser fra kontaktskjemaet (nyeste først). ready=false før SQL-en er kjørt. */
export async function getContactMessages(limit = 200): Promise<{ rows: ContactMessage[]; ready: boolean }> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("contact_messages")
      .select("id, created_at, name, email, phone, topic, message, callback, status, handled_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], ready: false };
    return { rows: (data ?? []) as ContactMessage[], ready: true };
  } catch {
    return { rows: [], ready: false };
  }
}

/** Antall nye (ubehandlede) henvendelser – for banneret i admin. */
export async function countNewContactMessages(): Promise<number> {
  try {
    const sb = await createClient();
    const { count, error } = await sb
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "ny");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
