"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Logger ut gjeldende bruker og sender til forsiden. */
export async function signOut() {
  const sb = await createClient();
  await sb.auth.signOut();
  redirect("/");
}
