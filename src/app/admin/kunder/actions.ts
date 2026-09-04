"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateCustomer(id: string, formData: FormData) {
  const sb = await createClient();
  await sb
    .from("customers")
    .update({
      notes: String(formData.get("notes") ?? "").trim() || null,
      category: String(formData.get("category") ?? "").trim() || null,
    })
    .eq("id", id);
  revalidatePath(`/admin/kunder/${id}`);
  revalidatePath("/admin/kunder");
}
